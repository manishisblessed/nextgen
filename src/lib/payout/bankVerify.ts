import { nanoid } from "nanoid";
import { isProd, flags } from "@/lib/env";
import {
  samedaySettlementConfigured,
  settlementAddAccount,
  settlementListAccounts,
} from "@/lib/partners/sameday-settlement";

/**
 * Bank penny-drop verification.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Payout beneficiaries must be validated by the bank before money can flow to
 * them (penny-drop: ₹1 is sent via IMPS and the bank returns the registered
 * account-holder name).
 *
 * Live provider: Same Day Solution Settlement API. Adding an account there runs
 * the penny-drop and returns the bank-verified name (see
 * postman/SameDaySolution-Settlement-API.postman_collection.json → "Add &
 * Verify Account"). When the Settlement partner is enabled + configured we use
 * it for real verification; otherwise we fall back to a deterministic dev stub
 * (SUCCESS in development, PENDING in production so nothing spends on a fake
 * success).
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

/** Whether the live Same Day Settlement penny-drop rail is available. */
function liveProviderReady(): boolean {
  return flags.settlement && samedaySettlementConfigured();
}

/**
 * Kick off a penny-drop verification.
 *
 * Live path (Same Day configured): reuse an account already added at the
 * provider, otherwise add + penny-drop verify it and map the outcome.
 * Fallback: SUCCESS stub in dev, PENDING "ask an admin" stub in prod.
 */
export async function verifyBankPennyDrop(input: BankVerifyInput): Promise<BankVerifyResult> {
  const orderId = input.orderId ?? newBankVerifyOrderId();

  if (liveProviderReady()) {
    return liveVerify(input, orderId);
  }

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
 * Poll a previously-initiated verification. Live path re-lists Same Day
 * accounts and resolves SUCCESS once the bank confirms; otherwise stays PENDING.
 */
export async function recheckBankVerification(input: {
  orderId: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
}): Promise<BankVerifyResult> {
  if (liveProviderReady()) {
    return liveRecheck(input);
  }

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

// ---------------------------------------------------------------------------
// Same Day Settlement live path
// ---------------------------------------------------------------------------

const PENDING_MESSAGE =
  "Penny-drop verification is in progress at the bank. Use Re-check in a moment.";

/** Match a Same Day account row against our (plaintext) account + IFSC. */
function accountMatches(a: { accountNumber: string; ifscCode: string }, accountNumber: string, ifsc: string) {
  return a.accountNumber === accountNumber && a.ifscCode?.toUpperCase() === ifsc.toUpperCase();
}

async function liveVerify(input: BankVerifyInput, orderId: string): Promise<BankVerifyResult> {
  // Reuse an account already added at Same Day (avoids a duplicate ₹4 charge
  // and handles retries after a transient failure).
  const listed = await settlementListAccounts();
  if (listed.ok) {
    const match = listed.data.find((a) => accountMatches(a, input.accountNumber, input.ifsc));
    if (match) {
      return match.isVerified
        ? {
            status: "SUCCESS",
            nameAtBank: match.verifiedName || normalizeName(input.holderName) || input.holderName.trim(),
            orderId,
            utr: null,
            failureReason: null,
            pendingMessage: null,
          }
        : {
            status: "PENDING",
            nameAtBank: null,
            orderId,
            utr: null,
            failureReason: null,
            pendingMessage: PENDING_MESSAGE,
          };
    }
  }

  const added = await settlementAddAccount({
    accountNumber: input.accountNumber,
    ifscCode: input.ifsc,
    accountHolderName: input.holderName,
    contactMobile: input.contactMobile,
  });

  if (!added.ok) {
    // Don't hard-fail (and eat the fee) on transient/provider errors — leave it
    // PENDING so the user can Re-check once Same Day settles the penny-drop.
    return {
      status: "PENDING",
      nameAtBank: null,
      orderId,
      utr: null,
      failureReason: null,
      pendingMessage: added.message || PENDING_MESSAGE,
    };
  }

  const status = (added.data.verificationStatus || "").toUpperCase();
  if (status === "SUCCESS") {
    return {
      status: "SUCCESS",
      nameAtBank:
        added.data.verifiedName ||
        added.data.account.verifiedName ||
        normalizeName(input.holderName) ||
        input.holderName.trim(),
      orderId,
      utr: null,
      failureReason: null,
      pendingMessage: null,
    };
  }
  if (status === "FAILED") {
    return {
      status: "FAILED",
      nameAtBank: null,
      orderId,
      utr: null,
      failureReason: "The bank could not verify this account. Check the account number and IFSC, then try again.",
      pendingMessage: null,
    };
  }
  return {
    status: "PENDING",
    nameAtBank: null,
    orderId,
    utr: null,
    failureReason: null,
    pendingMessage: PENDING_MESSAGE,
  };
}

async function liveRecheck(input: {
  orderId: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
}): Promise<BankVerifyResult> {
  const listed = await settlementListAccounts();
  if (listed.ok) {
    const match = listed.data.find((a) => accountMatches(a, input.accountNumber, input.ifsc));
    if (match?.isVerified) {
      return {
        status: "SUCCESS",
        nameAtBank: match.verifiedName || normalizeName(input.holderName) || input.holderName.trim(),
        orderId: input.orderId,
        utr: null,
        failureReason: null,
        pendingMessage: null,
      };
    }
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
