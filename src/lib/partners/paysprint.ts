/**
 * PaySprint adapter — covers AePS + DMT + (optionally) BBPS.
 *
 * Activate by:  PARTNER_AEPS_ENABLED=true  (and/or PARTNER_DMT_ENABLED=true)
 * Required env: PAYSPRINT_PARTNER_ID, PAYSPRINT_API_KEY, PAYSPRINT_JWT_KEY,
 *               PAYSPRINT_AES_KEY, PAYSPRINT_AES_IV, PAYSPRINT_BASE_URL.
 *
 * PaySprint requires an AES-encrypted JSON body wrapped in a JWT. The
 * wire-format helpers are intentionally kept here so the rest of the app
 * stays vendor-agnostic.
 */
import type { AepsProvider, DmtProvider, PartnerResult } from "./types";

const baseUrl = () => process.env.PAYSPRINT_BASE_URL!;
const partnerId = () => process.env.PAYSPRINT_PARTNER_ID!;

async function call<T>(path: string, body: unknown): Promise<PartnerResult<T>> {
  // TODO when activating:
  // 1. AES-256-CBC encrypt JSON body with PAYSPRINT_AES_KEY/IV
  // 2. Wrap as JWT with PAYSPRINT_JWT_KEY
  // 3. POST with headers: Token, Authorisedkey, accept
  // 4. Parse response, decrypt, normalise to PartnerResult.
  return {
    ok: false,
    code: "NOT_IMPLEMENTED",
    message: `PaySprint ${path} adapter not implemented. Fill in src/lib/partners/paysprint.ts.`
  };
}

export const paysprintAeps: AepsProvider = {
  name: "PAYSPRINT-AEPS",
  balance: (i) => call("/aeps/balanceenquiry", i),
  withdraw: (i) => call("/aeps/cashwithdraw", i),
  miniStatement: (i) => call("/aeps/ministatement", i)
};

export const paysprintDmt: DmtProvider = {
  name: "PAYSPRINT-DMT",
  verifyBeneficiary: (i) => call("/dmt/beneficiary/registerbeneficiary/verify", i),
  transfer: (i) => call("/dmt/dotransaction", i)
};

export function paysprintConfigured(): boolean {
  return Boolean(
    process.env.PAYSPRINT_PARTNER_ID &&
      process.env.PAYSPRINT_API_KEY &&
      process.env.PAYSPRINT_JWT_KEY &&
      process.env.PAYSPRINT_AES_KEY &&
      process.env.PAYSPRINT_AES_IV
  );
}
