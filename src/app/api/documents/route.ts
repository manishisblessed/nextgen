import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  type: z.enum([
    "PAN",
    "AADHAAR_FRONT",
    "AADHAAR_BACK",
    "SHOP_PHOTO",
    "BANK_PROOF",
    "GST_CERT",
    "SELFIE",
    "AGREEMENT",
    "OTHER"
  ]),
  publicId: z.string(),
  url: z.string().url(),
  resourceType: z.string().default("image"),
  format: z.string().optional(),
  bytes: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional()
});

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

  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      type: d.type,
      publicId: d.publicId,
      url: d.url,
      format: d.format,
      bytes: d.bytes,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
  });
}

/**
 * Persist a document AFTER the client has uploaded it directly to Cloudinary
 * using the credentials from /api/uploads/sign.
 */
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.document.create({
    data: {
      userId: user.id,
      ...parsed.data,
      isSensitive: true
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "document.upload",
      entity: "Document",
      entityId: doc.id,
      meta: { type: doc.type, publicId: doc.publicId }
    }
  });

  return NextResponse.json({ ok: true, document: doc });
}
