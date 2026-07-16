/**
 * Same Day Solution — Settlement API as a retailer payout rail.
 *
 * Implements the generic PayoutProvider contract on top of the Settlement
 * API (postman/SameDaySolution-Settlement-API.postman_collection.json) so the
 * standard payout lifecycle (hold → approve → worker → finalize) can disburse
 * via our Same Day partner wallet.
 *
 * Activate: PARTNER_PAYOUT_ENABLED=true  (flags.payout)
 *   needs: SAMEDAY_SETTLEMENT_API_KEY / SAMEDAY_SETTLEMENT_API_SECRET
 *          (falls back to SAMEDAY_POS_API_KEY / SECRET)
 *
 * Provider constraints (from the collection):
 * - Transfers go to PRE-VERIFIED accounts only. First payout to a new
 *   beneficiary triggers an add + penny-drop verification (₹4 partner-wallet
 *   charge) before the transfer.
 * - Bank modes only (IMPS/NEFT/RTGS). UPI payouts must route elsewhere.
 * - No client-supplied idempotency key; duplicate defense is the provider's
 *   2-minute per-account cooldown plus our worker's "reconcile if a provider
 *   txn id is already persisted" rule. The transfer response's reference_id
 *   is persisted as the payout's provider txn id and used for status polls.
 * - Failed transfers auto-refund the partner wallet.
 */
import type { PartnerResult, PayoutOutput, PayoutProvider } from "./types";
import {
  settlementAddAccount,
  settlementBalance,
  settlementListAccounts,
  settlementStatus,
  settlementTransfer,
  type SettlementMode,
  type SettlementTransaction,
} from "./sameday-settlement";

export { samedaySettlementConfigured as samedayPayoutConfigured } from "./sameday-settlement";

/** Settlement lifecycle → coarse payout states used by the worker. */
export function mapSettlementToPayoutStatus(
  status: SettlementTransaction["status"]
): PayoutOutput["status"] {
  switch (status) {
    case "SUCCESS":
      return "PAID";
    case "FAILED":
      return "FAILED";
    default:
      return "PROCESSING";
  }
}

/**
 * Find the verified Same Day settlement account for a beneficiary, adding and
 * penny-drop verifying it on first use. Returns the provider account id.
 */
async function resolveVerifiedAccount(beneficiary: {
  name: string;
  accountNumber: string;
  ifsc: string;
}): Promise<PartnerResult<{ accountId: string }>> {
  const listed = await settlementListAccounts();
  if (!listed.ok) return listed;

  const existing = listed.data.find(
    (a) => a.accountNumber === beneficiary.accountNumber && a.ifscCode === beneficiary.ifsc
  );
  if (existing) {
    if (!existing.isVerified) {
      return {
        ok: false,
        code: "VERIFICATION_PENDING",
        message: "Beneficiary account is awaiting penny-drop verification at Same Day — retry shortly",
      };
    }
    return { ok: true, data: { accountId: existing.id } };
  }

  const added = await settlementAddAccount({
    accountNumber: beneficiary.accountNumber,
    ifscCode: beneficiary.ifsc,
    accountHolderName: beneficiary.name,
  });
  if (!added.ok) return added;
  if (added.data.verificationStatus !== "SUCCESS") {
    return {
      ok: false,
      code: "VERIFICATION_PENDING",
      message: `Beneficiary verification is ${added.data.verificationStatus} at Same Day — retry once verified`,
      raw: added.raw,
    };
  }
  return { ok: true, data: { accountId: added.data.account.id }, raw: added.raw };
}

export const samedaySettlementPayout: PayoutProvider = {
  name: "SAMEDAY_SETTLEMENT",

  async payout(input) {
    if (input.mode === "UPI" || !input.beneficiary.accountNumber || !input.beneficiary.ifsc) {
      return {
        ok: false,
        code: "UNSUPPORTED_MODE",
        message: "Same Day settlement supports bank transfers (IMPS/NEFT/RTGS) only — UPI payouts need the BulkPe rail",
      };
    }

    const account = await resolveVerifiedAccount({
      name: input.beneficiary.name,
      accountNumber: input.beneficiary.accountNumber,
      ifsc: input.beneficiary.ifsc,
    });
    if (!account.ok) return account;

    const r = await settlementTransfer({
      accountId: account.data.accountId,
      amount: input.amount,
      mode: input.mode as SettlementMode,
      narration: input.purpose,
    });
    if (!r.ok) return r;

    return {
      ok: true,
      data: {
        // reference_id is what the status endpoint accepts — persist it as
        // the provider txn id so reconciliation can poll it later.
        payoutId: r.data.referenceId,
        utr: r.data.utr,
        status: mapSettlementToPayoutStatus(r.data.status),
      },
      partnerTxnId: r.data.referenceId,
      raw: r.raw,
    };
  },

  async status(payoutIdOrReference) {
    // Our internal reference ids ("PO…") are never sent to Same Day — only
    // the settlement reference_id persisted from the transfer response works.
    if (payoutIdOrReference.startsWith("PO")) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "No Same Day settlement reference persisted for this payout yet",
      };
    }
    const r = await settlementStatus(payoutIdOrReference);
    if (!r.ok) return r;
    return {
      ok: true,
      data: { status: mapSettlementToPayoutStatus(r.data.status), utr: r.data.utr },
      raw: r.raw,
    };
  },

  async fetchBalance() {
    const r = await settlementBalance();
    if (!r.ok) return r;
    return { ok: true, data: r.data.balance, raw: r.raw };
  },
};
