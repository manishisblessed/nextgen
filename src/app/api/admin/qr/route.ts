import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";
import { getQrClaimOverview } from "@/lib/qr/claims";

/**
 * Admin — static QR management.
 *   GET  — list every QR (newest first) + the claims overview numbers
 *   POST — upload a new QR image and make it THE active one (the previous
 *          active QR is disabled in the same transaction, so there is always
 *          at most one live QR for retailers)
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const CreateBody = z
  .object({
    label: z.string().min(2).max(120),
    upiVpa: z.string().regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/).optional(),
    dataUrl: z
      .string()
      .min(32)
      .max(8_000_000)
      .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Must be a PNG/JPEG/WebP image data URL"),
  })
  .strict();

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    return toErrorResponse(e);
  }

  const [qrs, overview] = await Promise.all([
    prisma.staticQr.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { claims: true } },
      },
    }),
    getQrClaimOverview(),
  ]);

  return NextResponse.json({
    qrs: qrs.map((q) => ({
      id: q.id,
      label: q.label,
      upiVpa: q.upiVpa,
      imageUrl: q.imageUrl,
      active: q.active,
      claimCount: q._count.claims,
      createdBy: q.createdBy.name,
      createdAt: q.createdAt.toISOString(),
      disabledAt: q.disabledAt?.toISOString() ?? null,
    })),
    overview,
  });
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`qr:manage:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    // QR images are meant to be shown to every retailer — public delivery.
    const uploaded = await uploadToCloudinary(parsed.data.dataUrl, {
      userId: admin.id,
      type: "static-qr",
      isSensitive: false,
    });

    const qr = await prisma.$transaction(async (tx) => {
      // Rotate: at most one active QR at any time.
      await tx.staticQr.updateMany({
        where: { active: true },
        data: { active: false, disabledAt: new Date(), disabledById: admin.id },
      });
      return tx.staticQr.create({
        data: {
          label: parsed.data.label,
          upiVpa: parsed.data.upiVpa ?? null,
          imagePublicId: uploaded.public_id,
          imageUrl: uploaded.secure_url,
          active: true,
          createdById: admin.id,
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "static_qr.activated",
        entity: "StaticQr",
        entityId: qr.id,
        meta: { label: qr.label, upiVpa: qr.upiVpa },
      },
    });

    return NextResponse.json(
      { id: qr.id, label: qr.label, upiVpa: qr.upiVpa, imageUrl: qr.imageUrl, active: qr.active },
      { status: 201 }
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
