/**
 * Re-KYC method configuration (Phase 13).
 *
 * The monthly re-verification method is configurable via the REKYC_METHOD env:
 *   - "aadhaar_otp"      → Aadhaar OTP eKYC only (default)
 *   - "face_match"       → liveness face match only
 *   - "aadhaar_otp+face" → Aadhaar OTP AND a fresh liveness face match
 *
 * Aadhaar OTP is treated as the primary second factor; face match is layered on
 * when the method includes it. Per the revised spec, the monthly face match
 * compares a FRESH liveness capture against the onboarding baseline (Phase 14).
 */

export type ReKycMethod = "aadhaar_otp" | "face_match" | "aadhaar_otp+face";

const VALID = new Set<ReKycMethod>(["aadhaar_otp", "face_match", "aadhaar_otp+face"]);

export function reKycMethod(): ReKycMethod {
  const raw = (process.env.REKYC_METHOD || "aadhaar_otp").trim() as ReKycMethod;
  return VALID.has(raw) ? raw : "aadhaar_otp";
}

export function methodRequiresAadhaarOtp(method: ReKycMethod): boolean {
  return method === "aadhaar_otp" || method === "aadhaar_otp+face";
}

export function methodRequiresFace(method: ReKycMethod): boolean {
  return method === "face_match" || method === "aadhaar_otp+face";
}

/** Minimum face-match confidence (0..100) to accept a monthly re-KYC. */
export function faceMatchThreshold(): number {
  const n = Number(process.env.REKYC_FACE_MATCH_THRESHOLD ?? "80");
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 80;
}
