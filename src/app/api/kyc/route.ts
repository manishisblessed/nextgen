import { NextResponse } from "next/server";
import { z } from "zod";
import { type Role } from "@prisma/client";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import {
  checkIdentityAvailability,
  requestIdentityException,
  identityDuplicateMessage,
  IDENTITY_DUPLICATE_CODES,
  IDENTITY_FIELD_LABELS,
  type IdentityFieldKey,
} from "@/lib/security/identityExceptions";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const [kyc, documents] = await Promise.all([
    prisma.kyc.findUnique({ where: { userId: user.id } }),
    prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    kyc: kyc
      ? {
          id: kyc.id,
          status: kyc.status,
          panNumber: kyc.panNumber,
          panVerifiedAt: kyc.panVerifiedAt?.toISOString() ?? null,
          aadhaarLast4: kyc.aadhaarLast4,
          aadhaarVerifiedAt: kyc.aadhaarVerifiedAt?.toISOString() ?? null,
          gstin: kyc.gstin,
          dob: kyc.dob?.toISOString() ?? null,
          rejectedReason: kyc.rejectedReason,
          submittedAt: kyc.submittedAt?.toISOString() ?? null,
          reviewedAt: kyc.reviewedAt?.toISOString() ?? null,
        }
      : null,
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type,
      publicId: d.publicId,
      url: d.url,
      format: d.format,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    userStatus: user.status,
  });
}

const SubmitBody = z.object({
  panNumber: z
    .string()
    .length(10)
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Invalid PAN format"),
  aadhaarLast4: z.string().length(4).regex(/^\d{4}$/),
  gstin: z
    .string()
    .length(15)
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/)
    .optional()
    .or(z.literal("")),
  dob: z.string().optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = SubmitBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.kyc.findUnique({
    where: { userId: user.id },
  });

  if (existing && existing.status === "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "KYC already submitted and under review" },
      { status: 409 }
    );
  }

  if (existing && existing.status === "APPROVED") {
    return NextResponse.json(
      { error: "KYC already approved" },
      { status: 409 }
    );
  }

  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    select: { type: true },
  });
  const uploadedTypes = new Set(docs.map((d) => d.type));
  const required = ["PAN", "AADHAAR_FRONT"] as const;
  const missing = required.filter((t) => !uploadedTypes.has(t));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required documents: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // ── Fraud gate: reject if PAN, Aadhaar, or GST is already used by another
  //    user, UNLESS a master-admin approved a value-scoped exception for this
  //    tier. See identityExceptions.ts. ──
  const panUp = parsed.data.panNumber.toUpperCase();
  const gstUp = parsed.data.gstin?.toUpperCase() || null;
  const role = user.role as Role;

  async function guard(fieldKey: IdentityFieldKey, value: string) {
    const avail = await checkIdentityAvailability({ fieldKey, value, role, excludeUserId: user!.id });
    if (avail.ok) return null;
    if (avail.reason === "NEEDS_APPROVAL") {
      await requestIdentityException({
        fieldKey,
        value,
        role,
        userId: user!.id,
        linkedUserId: avail.holders[0]?.userId ?? null,
        reason: `KYC submission for ${role} with duplicate ${IDENTITY_FIELD_LABELS[fieldKey]}`,
      });
    }
    return NextResponse.json(
      {
        error: identityDuplicateMessage(fieldKey, avail.reason),
        code: IDENTITY_DUPLICATE_CODES[fieldKey],
        needsApproval: avail.reason === "NEEDS_APPROVAL",
      },
      { status: 409 }
    );
  }

  const panBlocked = await guard("panNumber", panUp);
  if (panBlocked) return panBlocked;

  // Aadhaar here is only a last-4 (legacy manual path); we cannot value-scope to
  // a full number, so allow it only if an approved AADHAAR exception for this
  // tier matches the last-4, otherwise block on any other account's last-4.
  const approvedAadhaar = await prisma.identityException.findFirst({
    where: { field: "AADHAAR", role, status: "APPROVED", value: { endsWith: parsed.data.aadhaarLast4 } },
    select: { id: true },
  });
  if (!approvedAadhaar) {
    const dupAadhaar = await prisma.kyc.findFirst({
      where: { aadhaarLast4: parsed.data.aadhaarLast4, userId: { not: user.id } },
      select: { userId: true },
    });
    if (dupAadhaar) {
      return NextResponse.json(
        { error: "Another account is already registered with this Aadhaar number", code: "AADHAAR_DUPLICATE" },
        { status: 409 }
      );
    }
  }

  if (gstUp) {
    const gstBlocked = await guard("gstin", gstUp);
    if (gstBlocked) return gstBlocked;
  }

  const kyc = await prisma.kyc.upsert({
    where: { userId: user.id },
    update: {
      panNumber: parsed.data.panNumber.toUpperCase(),
      aadhaarLast4: parsed.data.aadhaarLast4,
      gstin: parsed.data.gstin || null,
      dob: parsed.data.dob ? new Date(parsed.data.dob) : null,
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
      rejectedReason: null,
    },
    create: {
      userId: user.id,
      panNumber: parsed.data.panNumber.toUpperCase(),
      aadhaarLast4: parsed.data.aadhaarLast4,
      gstin: parsed.data.gstin || null,
      dob: parsed.data.dob ? new Date(parsed.data.dob) : null,
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "kyc.submitted",
      entity: "Kyc",
      entityId: kyc.id,
      meta: { panNumber: parsed.data.panNumber },
    },
  });

  return NextResponse.json({
    kyc: {
      id: kyc.id,
      status: kyc.status,
      submittedAt: kyc.submittedAt?.toISOString(),
    },
  });
}
