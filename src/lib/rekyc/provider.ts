import { nanoid } from "nanoid";
import { flags, isProd } from "../env";
import {
  ekychubConfigured,
  aadhaarOtpInitiate as hubAadhaarInit,
  aadhaarOtpVerify as hubAadhaarVerify,
  faceMatch as hubFaceMatch,
} from "../partners/ekychub";

/**
 * Re-KYC provider abstraction over the eKYC Hub.
 *
 * Live path (PARTNER_VERIFICATION_ENABLED=true AND eKYC Hub creds present):
 *   real calls to the eKYC Hub Aadhaar-OTP and face-match APIs.
 *
 * Simulated path (provider not configured AND NODE_ENV !== "production"):
 *   deterministic local stubs so the whole gate → flow → unblock cycle is
 *   testable end-to-end without external creds. The dev OTP is "123456".
 *
 * In production the simulated path is refused — a missing/disabled provider
 * surfaces a clear error rather than silently waving identity checks through.
 */

export type ReKycProviderName = "EKYCHUB" | "SIMULATED";

/** Dev-only OTP accepted by the simulated provider. */
export const DEV_SIMULATED_OTP = "123456";

export function rekycLive(): boolean {
  return flags.verification && ekychubConfigured();
}

export function rekycProviderName(): ReKycProviderName {
  return rekycLive() ? "EKYCHUB" : "SIMULATED";
}

function assertSimulationAllowed(): void {
  if (isProd) {
    throw new Error(
      "[rekyc] Verification provider (eKYC Hub) is not configured. Set " +
        "PARTNER_VERIFICATION_ENABLED=true and EKYCHUB_USERNAME/EKYCHUB_API_TOKEN."
    );
  }
}

export type AadhaarInitResult =
  | { ok: true; referenceId: string }
  | { ok: false; code: string; message: string };

export async function initiateAadhaarOtp(input: {
  aadhaar: string;
  orderid: string;
}): Promise<AadhaarInitResult> {
  if (rekycLive()) {
    const res = await hubAadhaarInit({ aadhaar: input.aadhaar, orderid: input.orderid });
    if (res.ok) return { ok: true, referenceId: String(res.data.reference_id) };
    return { ok: false, code: res.code, message: res.message };
  }
  assertSimulationAllowed();
  return { ok: true, referenceId: `SIMREF_${nanoid(12)}` };
}

export type AadhaarVerifyResult =
  | { ok: true; name: string; maskedAadhaar: string | null; dob: string | null }
  | { ok: false; code: string; message: string };

export async function verifyAadhaarOtp(input: {
  referenceId: string;
  otp: string;
  orderid: string;
}): Promise<AadhaarVerifyResult> {
  if (rekycLive()) {
    const res = await hubAadhaarVerify({
      reference_id: input.referenceId,
      otp: input.otp,
      orderid: input.orderid,
    });
    if (res.ok) {
      return {
        ok: true,
        name: res.data.name,
        maskedAadhaar: res.data.aadhaar_number ?? null,
        dob: res.data.dob ?? null,
      };
    }
    return { ok: false, code: res.code, message: res.message };
  }
  assertSimulationAllowed();
  if (input.otp !== DEV_SIMULATED_OTP) {
    return { ok: false, code: "OTP_MISMATCH", message: "Invalid OTP (dev simulation expects 123456)" };
  }
  return { ok: true, name: "SIMULATED USER", maskedAadhaar: "XXXXXXXX1234", dob: null };
}

export type FaceMatchResult =
  | { ok: true; match: boolean; confidence: number }
  | { ok: false; code: string; message: string };

export async function matchFace(input: {
  baselineRef: string;
  probeRef: string;
  orderid: string;
}): Promise<FaceMatchResult> {
  if (rekycLive()) {
    const res = await hubFaceMatch({
      baselineRef: input.baselineRef,
      probeRef: input.probeRef,
      orderid: input.orderid,
    });
    if (res.ok) return { ok: true, match: res.data.match, confidence: res.data.confidence };
    return { ok: false, code: res.code, message: res.message };
  }
  assertSimulationAllowed();
  // Simulated match passes when a probe is supplied.
  return { ok: true, match: !!input.probeRef, confidence: input.probeRef ? 99 : 0 };
}
