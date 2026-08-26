import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";

/**
 * Read-only "reservation" rows for a user's payout holds and releases.
 *
 * Payout funds are HELD (a lien on spendable) at submit and only become a real
 * WalletTxn DEBIT when captured on success; a failed/rejected payout RELEASES the
 * hold back to spendable. Neither a hold nor its release is an actual money
 * movement, so — by design — they create NO WalletTxn. That keeps the passbook,
 * every balance sum, the daily statement and reconciliation exact.
 *
 * The downside was that a failed payout left no trace, so the retailer couldn't
 * see that their money came back. These synthetic memo rows fix that: they are
 * derived from PayoutRequest at read time, carry `balanceAfter: null`, and never
 * participate in any balance, statement, export total or reconciliation check.
 * They exist purely to narrate the reservation lifecycle in the ledger view.
 */
export type LedgerMemoRow = {
  id: string;
  direction: "CREDIT" | "DEBIT";
  reason: "PAYOUT_HOLD" | "PAYOUT_RELEASE";
  amount: number;
  /** Always null — a reservation never moves the wallet balance. */
  balanceAfter: number | null;
  note: string;
  refType: "PayoutRequest";
  refId: string;
  createdAt: string;
  memo: true;
};

export type MemoFilters = {
  direction?: string | null;
  reason?: string | null;
  q?: string | null;
  /** Inclusive date-range bounds as YYYY-MM-DD (matches the admin ledger picker). */
  from?: string | null;
  to?: string | null;
};

/** Payout states that are still holding funds (reservation live, not captured). */
const HELD_STATUSES = ["PENDING_APPROVAL", "APPROVED", "PROCESSING"];

export async function buildPayoutLedgerMemos(
  userId: string,
  f: MemoFilters = {}
): Promise<LedgerMemoRow[]> {
  const dir = f.direction === "CREDIT" || f.direction === "DEBIT" ? f.direction : null;
  const reason = f.reason || null;

  // A hold memo is a DEBIT / PAYOUT_HOLD; a release memo is a CREDIT / PAYOUT_RELEASE.
  // Skip the DB read entirely when the active filters can't match either memo type.
  const wantHold = (!dir || dir === "DEBIT") && (!reason || reason === "PAYOUT_HOLD");
  const wantRelease = (!dir || dir === "CREDIT") && (!reason || reason === "PAYOUT_RELEASE");
  if (!wantHold && !wantRelease) return [];

  const payouts = await prisma.payoutRequest.findMany({
    where: {
      userId,
      status: { in: ["PENDING_APPROVAL", "APPROVED", "PROCESSING", "FAILED", "REJECTED"] },
    },
    select: {
      id: true,
      beneficiaryName: true,
      accountLast4: true,
      totalDebit: true,
      status: true,
      createdAt: true,
      completedAt: true,
    },
  });

  const rows: LedgerMemoRow[] = [];
  for (const p of payouts) {
    const amount = toNumber(p.totalDebit);
    const acct = `****${p.accountLast4}`;
    const held = HELD_STATUSES.includes(p.status);
    const released = p.status === "FAILED" || p.status === "REJECTED";

    // Reservation placed at submit — shown while a payout is still holding funds,
    // and as the first half of the pair for a failed/rejected payout.
    if (wantHold && (held || released)) {
      rows.push({
        id: `payout-hold-${p.id}`,
        direction: "DEBIT",
        reason: "PAYOUT_HOLD",
        amount,
        balanceAfter: null,
        note: `Funds held for payout to ${p.beneficiaryName} (${acct})`,
        refType: "PayoutRequest",
        refId: p.id,
        createdAt: p.createdAt.toISOString(),
        memo: true,
      });
    }

    // Reservation released back to spendable — the reassuring second half.
    if (wantRelease && released) {
      rows.push({
        id: `payout-release-${p.id}`,
        direction: "CREDIT",
        reason: "PAYOUT_RELEASE",
        amount,
        balanceAfter: null,
        note: `Hold released — payout ${
          p.status === "REJECTED" ? "rejected" : "failed"
        }, amount returned to your wallet`,
        refType: "PayoutRequest",
        refId: p.id,
        createdAt: (p.completedAt ?? p.createdAt).toISOString(),
        memo: true,
      });
    }
  }

  let out = rows;
  if (f.q) {
    const needle = f.q.toLowerCase();
    out = out.filter(
      (r) => r.note.toLowerCase().includes(needle) || r.refId.toLowerCase().includes(needle)
    );
  }

  const fromMs = f.from ? new Date(f.from).getTime() : null;
  const toMs = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : null;
  if (fromMs !== null || toMs !== null) {
    out = out.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    });
  }

  // Newest first, matching the ledger's ordering; deterministic id tiebreak.
  out.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1
  );
  return out;
}
