import { prisma } from "@/lib/db";

/**
 * Data used to prefill the Payment Gateway (PG) onboarding form for an
 * onboardee. The applicant downloads the prefilled PDF, signs it and uploads
 * the signed copy as their `PG_FORM` document.
 *
 * The values are pulled straight from the verification results already
 * collected during onboarding (PAN, Aadhaar/DigiLocker, GST, Bank penny-drop)
 * so the shape mirrors `buildDeclarationData` and never drifts from what the
 * applicant actually verified.
 */
export type PgFormData = {
  date: string;

  applicantName: string;
  applicantId: string;
  businessName: string;
  mobile: string;
  email: string;
  address: string;
  pan: string;
  aadhaar: string;
  gstin: string;

  bankAccountHolder: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;

  role: string;
};

export async function buildPgFormData(inviteId: string): Promise<PgFormData | null> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return null;

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
  const bizV = findV("BUSINESS_NAME");
  const businessName =
    gstPayload?.trade_name_of_business ??
    gstPayload?.trade_name ??
    gstPayload?.legal_name_of_business ??
    gstV?.verifiedName ??
    bizV?.verifiedName ??
    (bizV?.responsePayload as any)?.business_name ??
    "";

  const gstin =
    (gstV?.requestPayload as any)?.gstin ??
    gstPayload?.gstin ??
    "";

  const bankV = findV("BANK_PENNY_DROP") ?? findV("BANK_ADVANCE");
  const bankReq = (bankV?.requestPayload as any) ?? {};
  const bankResp = (bankV?.responsePayload as any) ?? {};

  const aadhaarLast4 = aadhaarPayload?.uid ? String(aadhaarPayload.uid).slice(-4) : "";
  const applicantAadhaar = aadhaarLast4 ? `XXXX-XXXX-${aadhaarLast4}` : "";

  const applicantName =
    aadhaarV?.verifiedName ??
    aadhaarPayload?.name ??
    panV?.verifiedName ??
    invite.name ??
    "";

  const address =
    aadhaarPayload?.address ??
    gstPayload?.principal_place_address ??
    "";

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  return {
    date: dateStr,

    applicantName,
    applicantId: invite.id.slice(-8).toUpperCase(),
    businessName,
    mobile: invite.phone,
    email: invite.email,
    address,
    pan: panNumber,
    aadhaar: applicantAadhaar,
    gstin,

    bankAccountHolder: bankV?.verifiedName ?? bankResp?.nameAtBank ?? "",
    bankAccountNumber: bankReq?.account_number ?? bankResp?.account_number ?? "",
    bankIfsc: (bankReq?.ifsc ?? bankResp?.ifsc ?? "").toString().toUpperCase(),
    bankName: bankResp?.bank_name ?? bankResp?.bankName ?? "",

    role: invite.role,
  };
}
