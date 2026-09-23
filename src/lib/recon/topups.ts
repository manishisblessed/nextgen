/**
 * Wallet top-up / PG-collect reconciliation sweep.
 *
 * Viable PG has NO webhook, so a payin only settles when someone polls
 * TransactionStatus. The client poll + redirect handle the happy path, but if a
 * customer pays and then closes the browser, nothing would ever settle it.
 * This sweep is that safety net: it re-verifies every in-flight payin with the
 * provider and settles (credits) the ones that are actually PAID.
 *
 * Every path converges on the same idempotent settle (settleTopup /
 * settlePgCollect), which itself re-checks the provider before crediting — so
 * running this repeatedly, concurrently with the client poll, is always safe.
 *
 * Expiry: Viable checkout links die in ~2–5 min. An in-flight payin older than
 * TOPUP_EXPIRE_MIN that still isn't PAID is treated as dead and marked FAILED,
 * so the pending queue never grows without bound.
 */
import { prisma } from "../db";
import { settleTopup } from "../wallet/topup";
import { settlePgCollect } from "../wallet/pgCollect";
import { getPartner, isMockProvider } from "../partners";
import { sendOpsAlert } from "../monitoring/alerts";
import { logger } from "../logger";

const GRACE_MS = 30_000; // don't touch a payin younger than this (client owns it)
const LOOKBACK_MS = 24 * 60 * 60_000; // ignore ancient rows
const EXPIRE_MS = Number(process.env.TOPUP_EXPIRE_MIN ?? 30) * 60_000;

export type TopupReconResult = {
  skipped: boolean;
  scanned: number;
  settled: number;
  failed: number;
  expired: number;
  held: number;
  stillPending: number;
};

export async function runTopupReconciliation(): Promise<TopupReconResult> {
  const empty: TopupReconResult = { skipped: false, scanned: 0, settled: 0, failed: 0, expired: 0, held: 0, stillPending: 0 };

  // Never poll/settle through a mock provider (its status() always says PAID,
  // which would mint phantom balance). The dedicated settle functions also guard
  // this, but skipping up front avoids needless work + noisy errors.
  const upi = getPartner("upi");
  if (isMockProvider(upi)) return { ...empty, skipped: true };

  const now = Date.now();
  const rows = await prisma.transaction.findMany({
    where: {
      service: { in: ["WALLET_TOPUP", "UPI_COLLECT"] },
      status: { in: ["INITIATED", "PROCESSING"] },
      createdAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now - GRACE_MS) },
    },
    select: { id: true, refId: true, service: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const result: TopupReconResult = { ...empty, scanned: rows.length };

  for (const row of rows) {
    try {
      const r =
        row.service === "WALLET_TOPUP"
          ? await settleTopup(row.refId)
          : await settlePgCollect(row.refId);

      if (r.status === "SUCCESS") {
        result.settled += 1;
      } else if (r.status === "FAILED") {
        result.failed += 1;
      } else if (r.status === "HOLD") {
        // Amount mismatch parked for manual review — already alerted by the
        // settle fn and no longer INITIATED/PROCESSING, so it won't re-sweep.
        result.held += 1;
      } else {
        // Still pending. If it's past expiry, the checkout link is long dead —
        // mark FAILED so it stops being swept. Only flips rows still in-flight.
        if (now - row.createdAt.getTime() > EXPIRE_MS) {
          const upd = await prisma.transaction.updateMany({
            where: { id: row.id, status: { in: ["INITIATED", "PROCESSING"] } },
            data: { status: "FAILED", errorCode: "EXPIRED", errorMessage: "Payment not completed in time" },
          });
          if (upd.count > 0) result.expired += 1;
          else result.stillPending += 1;
        } else {
          result.stillPending += 1;
        }
      }
    } catch {
      // Provider hiccup / unknown ref — leave it for the next sweep.
      result.stillPending += 1;
    }
  }

  if (result.settled || result.failed || result.expired || result.held) {
    logger.info({ action: "topup.reconcile", ...result });
  }

  // OPS ALERT: an unusually large in-flight backlog means either the provider is
  // wedged or clients are stranded mid-payment. Fire a throttled warning so ops
  // can look before customers complain. `stillPending` here excludes just-settled
  // / just-failed rows, so a high number is genuinely stuck traffic.
  const stuckThreshold = Number(process.env.TOPUP_STUCK_ALERT ?? 25);
  if (result.stillPending >= stuckThreshold) {
    await maybeAlert(
      "topup-stuck",
      {
        title: "Wallet payins backing up — many stuck pending",
        severity: "warning",
        details: {
          stillPending: result.stillPending,
          settled: result.settled,
          failed: result.failed,
          expired: result.expired,
        },
      },
      10 * 60_000
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Throttled alerting: in-process dedupe so a persistent condition alerts at most
// once per window (per worker) instead of every sweep. Best-effort; a worker
// restart resets the clock (acceptable — we'd rather re-alert than go silent).
// ---------------------------------------------------------------------------
const lastAlertAt = new Map<string, number>();
async function maybeAlert(
  key: string,
  payload: Parameters<typeof sendOpsAlert>[0],
  windowMs: number
): Promise<void> {
  const now = Date.now();
  const prev = lastAlertAt.get(key) ?? 0;
  if (now - prev < windowMs) return;
  lastAlertAt.set(key, now);
  try {
    await sendOpsAlert(payload);
  } catch (err) {
    logger.warn({ action: "topup.alert_failed", key, err: String(err) });
  }
}

export type TopupIntegrityResult = {
  checked: number;
  missingCredits: number;
  offenders: string[];
};

/**
 * DEFENSE-IN-DEPTH integrity sweep (Phase 3).
 *
 * The credit is written inside the SAME db transaction that flips a top-up to
 * SUCCESS, so a SUCCESS row should ALWAYS have its `topup:<id>` wallet credit.
 * This sweep proves that invariant holds in production: any SUCCESS top-up in the
 * lookback window that is missing its credit ledger row is a genuine money bug —
 * we alert critically and name the offenders so ops can reconcile immediately.
 * It never mutates balances itself (auto-crediting here could double-credit); it
 * only detects + escalates.
 */
export async function runTopupIntegrityCheck(): Promise<TopupIntegrityResult> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const rows = await prisma.transaction.findMany({
    where: { service: "WALLET_TOPUP", status: "SUCCESS", updatedAt: { gte: since } },
    select: { id: true, refId: true, amount: true },
    take: 2000,
  });

  const offenders: string[] = [];
  for (const row of rows) {
    const credit = await prisma.walletTxn.findUnique({
      where: { idempotencyKey: `topup:${row.id}` },
      select: { id: true },
    });
    if (!credit) offenders.push(row.refId);
  }

  const result: TopupIntegrityResult = {
    checked: rows.length,
    missingCredits: offenders.length,
    offenders: offenders.slice(0, 20),
  };

  if (offenders.length > 0) {
    logger.error({ action: "topup.integrity_breach", ...result });
    await maybeAlert(
      "topup-integrity",
      {
        title: "CRITICAL: top-ups marked SUCCESS without a wallet credit",
        severity: "critical",
        details: { missingCredits: offenders.length, sample: result.offenders.join(", ") },
      },
      30 * 60_000
    );
  }

  return result;
}
