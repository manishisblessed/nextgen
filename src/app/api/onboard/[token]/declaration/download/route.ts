import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateDeclarationPdf } from "@/lib/declaration/generatePdf";
import type { DeclarationData, DeclarationRole } from "@/lib/declaration/types";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(
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

  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedById },
    include: { kyc: true },
  });

  if (!inviter) {
    return NextResponse.json({ error: "Inviter not found" }, { status: 404 });
  }

  const verifications = await prisma.verificationResult.findMany({
    where: { inviteId: invite.id },
    select: { type: true, status: true, verifiedName: true, responsePayload: true },
  });

  const aadhaarV = verifications.find(
    (v) => v.type === "AADHAAR_DIGILOCKER" && v.status === "Success"
  );
  const aadhaarPayload = aadhaarV?.responsePayload as any;

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const data: DeclarationData = {
    date: dateStr,

    creatorName: inviter.name,
    creatorId: inviter.id.slice(-8).toUpperCase(),
    creatorCompany: inviter.shopName ?? "",
    creatorMobile: inviter.phone,
    creatorEmail: inviter.email,
    creatorAddress: [inviter.shopAddress, inviter.city, inviter.state, inviter.pincode]
      .filter(Boolean)
      .join(", "),
    creatorPan: inviter.kyc?.panNumber ?? "",
    creatorAadhaar: inviter.kyc?.aadhaarNumber
      ? `XXXX-XXXX-${inviter.kyc.aadhaarLast4 ?? inviter.kyc.aadhaarNumber.slice(-4)}`
      : "",
    creatorRole: inviter.role as DeclarationRole,

    onboardeeName: invite.name ?? aadhaarPayload?.name ?? "",
    onboardeeId: invite.id.slice(-8).toUpperCase(),
    onboardeeBusiness: "",
    onboardeeMobile: invite.phone,
    onboardeeAddress: aadhaarPayload?.address ?? "",
    onboardeeRole: invite.role as DeclarationRole,
  };

  const pdfBytes = await generateDeclarationPdf(data);

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="declaration-${invite.role.toLowerCase()}-${invite.id.slice(-6)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
