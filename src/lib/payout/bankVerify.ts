import { nanoid } from "nanoid";
import { isProd } from "@/lib/env";

/**
 * Bank penny-drop verification (stub).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Payout beneficiaries must be validated by the bank before money can flow to
 * them (penny-drop: ₹1 is sent via IMPS and the bank returns the registered
 * account-holder name). NEXTGEN doesn't have a live verification provider
 * wired up yet, so this module ships a deterministic stub that
 *
 *   - accepts the same input shape a real provider would,
 *   - returns { status: "SUCCESS", nameAtBank } in development so the whole
 *     beneficiary UI/flow is exercisable end-to-end, and
 *   - returns { status: "PENDING" } in production so real users see the exact
 *     "verification in progress, click Re-check" state (and can't accidentally
 *     spend on a fake success).
 *
 * When a real provider is picked (Cashfree / Razorpay / Decentro / etc.),
 * replace the body of `verifyBankPennyDrop` and `recheckBankVerification` with
 * the provider SDK calls. The public shape here is intentionally minimal so
 * callers don't need to change.
 */

export type BankVerifyStatus = "SUCCESS" | "PENDING" | "FAILED";

export type BankVerifyInput = {
  accountNumber: string;
  ifsc: string;
  holderName: string;
  contactMobile?: string;
  orderId?: string;
};

export type BankVerifyResult = {
  status: BankVerifyStatus;
  /** Bank-returned account-holder name on SUCCESS; null otherwise. */
  nameAtBank: string | null;
  /** Provider correlation id we persist for reconciliation. */
  orderId: string;
  /** IMPS UTR of the ₹1 credit, when the provider echoes it back. */
  utr?: string | null;
  /** Human-friendly failure message for FAILED. */
  failureReason?: string | null;
  /** Structured message for PENDING (shown next to the Re-check button). */
  pendingMessage?: string | null;
};

/** Generate an idempotent provider order id — safe to persist + re-use for a retry. */
export function newBankVerifyOrderId(prefix = "PB"): string {
  return `${prefix}${nanoid(18).toUpperCase()}`;
}

/**
 * Kick off a penny-drop verification. In dev this synchronously resolves
 * SUCCESS with the caller-provided name (echoed back the way most providers do
 * when name-match is not requested). In prod it stays PENDING so the UI must
 * show a Re-check button — safer default while the real provider is not wired.
 */
export async function verifyBankPennyDrop(input: BankVerifyInput): Promise<BankVerifyResult> {
  const orderId = input.orderId ?? newBankVerifyOrderId();

  if (!isProd) {
    // Deterministic dev outcome. Providers usually normalise the name (uppercase,
    // trimmed, honorifics stripped); mirror that here so the UI can display
    // exactly what the "bank" said.
    const nameAtBank = normalizeName(input.holderName) || input.holderName.trim();
    return {
      status: "SUCCESS",
      nameAtBank,
      orderId,
      utr: `PBSTUB${nanoid(6).toUpperCase()}`,
      failureReason: null,
      pendingMessage: null,
    };
  }

  return {
    status: "PENDING",
    nameAtBank: null,
    orderId,
    utr: null,
    failureReason: null,
    pendingMessage:
      "Penny-drop verification is not yet wired to a live provider. Ask an admin to enable the provider integration.",
  };
}

/**
 * Poll a previously-initiated verification. In dev it flips to SUCCESS
 * immediately; in prod it stays PENDING until the provider is wired.
 */
export async function recheckBankVerification(input: {
  orderId: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
}): Promise<BankVerifyResult> {
  if (!isProd) {
    const nameAtBank = normalizeName(input.holderName) || input.holderName.trim();
    return {
      status: "SUCCESS",
      nameAtBank,
      orderId: input.orderId,
      utr: `PBSTUB${nanoid(6).toUpperCase()}`,
      failureReason: null,
      pendingMessage: null,
    };
  }

  return {
    status: "PENDING",
    nameAtBank: null,
    orderId: input.orderId,
    utr: null,
    failureReason: null,
    pendingMessage: "Still waiting on the bank. Try again in a few minutes.",
  };
}

function normalizeName(raw: string): string {
  return raw
    .replace(/[^A-Za-z\s\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
