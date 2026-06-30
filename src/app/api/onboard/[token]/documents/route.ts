import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const DOCUMENT_TYPES = [
  "PAN",
  "AADHAAR_FRONT",
  "AADHAAR_BACK",
  "SHOP_PHOTO",
  "BANK_PROOF",
  "CANCEL_CHEQUE",
  "PASSBOOK",
  "GST_CERT",
  "SELFIE",
  "LIVE_VIDEO",
  "SHOP_ESTABLISHMENT",
  "GUMASTA_LICENSE",
  "SIGNATURE",
  "ELECTRICITY_BILL",
  "ADDITIONAL_ID",
  "FAMILY_REFERENCE",
  "PG_FORM",
  "GPS_PHOTO_OUTSIDE",
  "GPS_PHOTO_INSIDE",
  "GPS_SELFIE_DISTRIBUTOR",
  "DISTRIBUTOR_DECLARATION",
  "OTHER",
] as const;

const Body = z.object({
  type: z.enum(DOCUMENT_TYPES),
  publicId: z.string(),
  url: z.string().url(),
  resourceType: z.string().default("image"),
  format: z.string().optional(),
  bytes: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  gpsLatitude: z.number().optional(),
  gpsLongitude: z.number().optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  if (!["PENDING", "REGISTERED"].includes(invite.status)) {
    return NextResponse.json(
      { error: "Invite is no longer active" },
      { status: 400 }
    );
  }

  if (new Date() > invite.expiresAt) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.verificationResult.create({
    data: {
      inviteId: invite.id,
      userId: invite.userId,
      type: `DOCUMENT_${parsed.data.type}`,
      orderid: `DOC_${Date.now()}_${parsed.data.type}`,
      status: "Uploaded",
      requestPayload: {
        publicId: parsed.data.publicId,
        url: parsed.data.url,
        resourceType: parsed.data.resourceType,
        format: parsed.data.format,
        bytes: parsed.data.bytes,
        width: parsed.data.width,
        height: parsed.data.height,
        gpsLatitude: parsed.data.gpsLatitude,
        gpsLongitude: parsed.data.gpsLongitude,
      },
    },
  });

  return NextResponse.json({ ok: true, id: doc.id });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const docs = await prisma.verificationResult.findMany({
    where: {
      inviteId: invite.id,
      type: { startsWith: "DOCUMENT_" },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      type: d.type.replace("DOCUMENT_", ""),
      ...(d.requestPayload as Record<string, unknown>),
      createdAt: d.createdAt.toISOString(),
    })),
  });
}
