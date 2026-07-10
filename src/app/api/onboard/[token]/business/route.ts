import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({
  shopName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters")
    .max(120, "Business name is too long"),
});

/**
 * Persist a manually entered business / shop name when GST is skipped or
 * does not return a trade name. Stored as VerificationResult(BUSINESS_NAME)
 * so the self-declaration PDF and later registration can reuse it.
 */
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
    return NextResponse.json({ error: "Invite is no longer active" }, { status: 400 });
  }
  if (new Date() > invite.expiresAt) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid business name" },
      { status: 400 }
    );
  }

  const shopName = parsed.data.shopName;

  // Replace any prior manual business-name record for this invite.
  await prisma.verificationResult.deleteMany({
    where: { inviteId: invite.id, type: "BUSINESS_NAME" },
  });

  await prisma.verificationResult.create({
    data: {
      inviteId: invite.id,
      type: "BUSINESS_NAME",
      orderid: `BIZ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      status: "Success",
      verifiedName: shopName,
      requestPayload: { source: "manual", shopName },
      responsePayload: { business_name: shopName },
    },
  });

  return NextResponse.json({ ok: true, shopName });
}
