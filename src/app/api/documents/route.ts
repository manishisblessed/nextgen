import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

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

/**
 * Persist a document AFTER the client has uploaded it directly to Cloudinary
 * using the credentials from /api/uploads/sign.
 */
export async function POST(req: Request) {
  // TODO: replace with real session check
  const userId = "demo-user";

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.document.create({
    data: {
      userId,
      ...parsed.data,
      isSensitive: true
    }
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "document.upload",
      entity: "Document",
      entityId: doc.id,
      meta: { type: doc.type, publicId: doc.publicId }
    }
  });

  return NextResponse.json({ ok: true, document: doc });
}
