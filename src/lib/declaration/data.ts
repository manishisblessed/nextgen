import { prisma } from "@/lib/db";
import type { DeclarationData, DeclarationRole } from "./types";

/**
 * Assemble the declaration data for an invite by pulling together the inviter
 * (successor/upline), the invitee, and every verification result collected in
 * the earlier onboarding steps (PAN, Aadhaar, GST). Used by the onboardee's
 * self-declaration download, the successor's document view, and the final
 * signed-approval PDF, so all three always agree.
 */
export async function buildDeclarationData(inviteId: string): Promise<DeclarationData | null> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return null;

  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedById },
    include: { kyc: true },
  });
  if (!inviter) return null;

  const verifications = await prisma.verificationResult.findMany({
    where: { inviteId: invite.id },
    orderBy: { createdAt: "desc" },
    select: { type: true, status: true, verifiedName: true, requestPayload: true, responsePayload: true },
  });

  const findV = (type: string) =>
    verifications.find((v) => v.type === type && v.status === "Success");

  const aadhaarV = findV("AADHAAR_DIGILOCKER");
  const aadhaarPayload = aadhaarV?.responsePayload as any;

  const panV = findV("PAN_360");
  const panNumber =
    (panV?.requestPayload as any)?.pan ?? (panV?.responsePayload as any)?.pan ?? "";

  const gstV = findV("GST");
  const gstPayload = gstV?.responsePayload as any;
  const businessName =
    gstPayload?.trade_name_of_business ??
    gstPayload?.trade_name ??
    gstPayload?.legal_name_of_business ??
    gstV?.verifiedName ??
    "";

  const onboardeeAadhaar = aadhaarPayload?.uid
    ? `XXXX-XXXX-${String(aadhaarPayload.uid).slice(-4)}`
    : "";

  // Prefer the Aadhaar-verified name so the declaration carries the real
  // documented name, falling back to PAN and only then the invite name.
  const onboardeeName =
    aadhaarV?.verifiedName ??
    aadhaarPayload?.name ??
    panV?.verifiedName ??
    invite.name ??
    "";
  const onboardeeAddress = aadhaarPayload?.address ?? gstPayload?.principal_place_address ?? "";

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  return {
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

    onboardeeName,
    onboardeeId: invite.id.slice(-8).toUpperCase(),
    onboardeeBusiness: businessName,
    onboardeeMobile: invite.phone,
    onboardeeEmail: invite.email,
    onboardeeAddress,
    onboardeePan: panNumber,
    onboardeeAadhaar,
    onboardeeRole: invite.role as DeclarationRole,
  };
}
