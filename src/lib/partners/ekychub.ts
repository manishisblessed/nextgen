/**
 * eKYC Hub adapter — covers identity & bank verification APIs.
 *
 * Activate by: PARTNER_VERIFICATION_ENABLED=true
 * Required env: EKYCHUB_USERNAME, EKYCHUB_API_TOKEN, EKYCHUB_BASE_URL
 *
 * All eKYC Hub APIs are GET requests with auth passed as query params.
 * Responses follow: { status: "Success", ...data } | { status: "Failure", message }
 */
import type { PartnerResult } from "./types";

function baseUrl(): string {
  return process.env.EKYCHUB_BASE_URL || "https://connect.ekychub.in/v3";
}

function username(): string {
  return process.env.EKYCHUB_USERNAME!;
}

function token(): string {
  return process.env.EKYCHUB_API_TOKEN!;
}

export function ekychubConfigured(): boolean {
  return !!(process.env.EKYCHUB_USERNAME && process.env.EKYCHUB_API_TOKEN);
}

async function ekychubGet<T>(
  path: string,
  params: Record<string, string>
): Promise<PartnerResult<T>> {
  const url = new URL(`${baseUrl()}${path}`);
  url.searchParams.set("username", username());
  url.searchParams.set("token", token());
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const data = await res.json();

  if (data.status === "Success") {
    return { ok: true, data: data as T, raw: data };
  }
  return {
    ok: false,
    code: "EKYCHUB_FAILURE",
    message: data.message ?? "Verification failed",
    raw: data,
  };
}

// ---------------------------------------------------------------------------
// Balance Check
// ---------------------------------------------------------------------------

export interface EkycBalanceResponse {
  status: string;
  balance: string;
}

export async function checkBalance(): Promise<PartnerResult<EkycBalanceResponse>> {
  return ekychubGet("/verification/balance", {});
}

// ---------------------------------------------------------------------------
// PAN 360 Verification
// ---------------------------------------------------------------------------

export interface Pan360Response {
  status: string;
  pan: string;
  type: string;
  registered_name: string;
  gender: string;
  date_of_birth: string;
  masked_aadhaar_number: string;
  aadhaar_linked: boolean;
  message: string;
}

export async function verifyPan360(input: {
  pan: string;
  orderid: string;
}): Promise<PartnerResult<Pan360Response>> {
  return ekychubGet("/verification/pan_360", {
    pan: input.pan.toUpperCase(),
    orderid: input.orderid,
  });
}

// ---------------------------------------------------------------------------
// GST Verification
// ---------------------------------------------------------------------------

export interface GstResponse {
  status: string;
  GSTIN: string;
  legal_name_of_business: string;
  trade_name_of_business: string;
  center_jurisdiction: string;
  state_jurisdiction: string;
  constitution_of_business: string;
  taxpayer_type: string;
  gst_in_status: string;
  last_update_date: string;
  principal_place_address: string;
  message: string;
}

export async function verifyGst(input: {
  gst: string;
  orderid: string;
}): Promise<PartnerResult<GstResponse>> {
  return ekychubGet("/verification/gst_verification", {
    gst: input.gst.toUpperCase(),
    orderid: input.orderid,
  });
}

// ---------------------------------------------------------------------------
// Bank Verification (Advance — no penny drop)
// ---------------------------------------------------------------------------

export interface BankVerifyResponse {
  status: string;
  nameAtBank: string;
  bankName: string;
  utr: string;
  city: string;
  branch: string;
  micr: number;
  message: string;
}

export async function verifyBankAdvance(input: {
  account_number: string;
  ifsc: string;
  orderid: string;
}): Promise<PartnerResult<BankVerifyResponse>> {
  return ekychubGet("/verification/bank_verification", {
    account_number: input.account_number,
    ifsc: input.ifsc.toUpperCase(),
    orderid: input.orderid,
  });
}

// ---------------------------------------------------------------------------
// Penny Drop (Bank Account Verification)
// ---------------------------------------------------------------------------

export interface PennyDropResponse {
  status: string;
  "Account Number": string;
  "Ifsc Code": string;
  nameAtBank: string;
  utr: string;
  message: string;
}

export async function verifyPennyDrop(input: {
  account_number: string;
  ifsc: string;
  orderid: string;
}): Promise<PartnerResult<PennyDropResponse>> {
  return ekychubGet("/verification/penny_drop", {
    account_number: input.account_number,
    ifsc: input.ifsc.toUpperCase(),
    orderid: input.orderid,
  });
}

// ---------------------------------------------------------------------------
// Company CIN Verification
// ---------------------------------------------------------------------------

export interface CinResponse {
  status: string;
  message: string;
  company_name: string;
  data: {
    verification_id: string;
    reference_id: number;
    status: string;
    cin: string;
    company_name: string;
    registration_number: number;
    incorporation_date: string;
    cin_status: string;
    email: string;
    incorporation_country: string;
    director_details: Array<{
      dob: string;
      designation: string;
      address: string;
      din: string;
      name: string;
    }>;
  };
}

export async function verifyCin(input: {
  cin: string;
  orderid: string;
}): Promise<PartnerResult<CinResponse>> {
  return ekychubGet("/verification/cin", {
    cin: input.cin.toUpperCase(),
    orderid: input.orderid,
  });
}

// ---------------------------------------------------------------------------
// Digilocker — Step 1: Create Redirect URL
// ---------------------------------------------------------------------------

export interface DigilockerUrlResponse {
  verification_id: string;
  reference_id: number;
  url: string;
  status: string;
  document_requested: string[];
  user_flow: string;
  redirect_url: string;
  message: string;
  txid: number;
}

export async function createDigilockerUrl(input: {
  document_type: "AADHAAR" | "PAN";
  redirect_url: string;
  orderid: string;
}): Promise<PartnerResult<DigilockerUrlResponse>> {
  const path =
    input.document_type === "AADHAAR"
      ? "/digilocker/create_url_aadhaar"
      : "/digilocker/create_url_pan";

  return ekychubGet(path, {
    redirect_url: input.redirect_url,
    orderid: input.orderid,
  });
}

// ---------------------------------------------------------------------------
// Digilocker — Step 2: Get Document
// ---------------------------------------------------------------------------

export interface DigilockerDocResponse {
  reference_id: number;
  verification_id: string;
  status: string;
  name: string;
  uid: string;
  dob: string;
  gender: string;
  care_of: string;
  address: string;
  split_address: {
    country: string;
    dist: string;
    house: string;
    landmark: string;
    pincode: string;
    po: string;
    state: string;
    street: string;
    subdist: string;
    vtc: string;
  };
  year_of_birth: string;
  photo_link: string;
  xml_file: string;
  message: string;
}

export async function getDigilockerDocument(input: {
  verification_id: string;
  reference_id: string;
  orderid: string;
  document_type: "AADHAAR" | "PAN";
}): Promise<PartnerResult<DigilockerDocResponse>> {
  return ekychubGet("/digilocker/get_document", {
    verification_id: input.verification_id,
    reference_id: input.reference_id,
    orderid: input.orderid,
    document_type: input.document_type,
  });
}

// ---------------------------------------------------------------------------
// Unified verification provider interface
// ---------------------------------------------------------------------------

export const ekychubVerification = {
  name: "EKYCHUB",
  checkBalance,
  verifyPan360,
  verifyGst,
  verifyBankAdvance,
  verifyPennyDrop,
  verifyCin,
  createDigilockerUrl,
  getDigilockerDocument,
} as const;
