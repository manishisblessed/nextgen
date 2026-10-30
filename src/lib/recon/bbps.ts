import { Prisma, type ServiceCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { getPartner } from "@/lib/partners";
import { creditWallet } from "@/lib/ledger";
import { round, add } from "@/lib/money";
import { sendOpsAlert } from "@/lib/monitoring/alerts";
import { emitWebhookEvent } from "@/lib/platform/webhooks";
import { logger } from "@/lib/logger";

const BBPS_SERVICES: ServiceCode[] = [
  "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
  "BILL_CREDIT_CARD", "BILL_EDUCATION", "BILL_INSURANCE",
  "RECHARGE_BROADBAND",
];

/**
 * BBPS reconciliation — polls PROCESSING BBPS transactions and settles them.
 *
 * Unlike payouts (which have webhooks), BulkPe BBPS does not push status
 * updates. This sweep is our only safety net for transactions that returned
 * PENDING at pay-time or whose response was ambiguous.
 *
 * Three stages (mirrors the payout recon pattern):
 *   1. DRAIN   — poll every PROCESSING BBPS txn older than 2 minutes
 *   2. STUCK   — escalate anything still PROCESSING after 1 hour
 *   3. VERIFY  — re-check recent SUCCESS/FAILED rows (last 24h) for mismatches
 */

export type BbpsReconSummary = {
  ranAt: string;
  drained: number;
  settled: number;
  refunded: number;
  stuck: number;
  verified: number;
  mismatches: number;
  skipped: boolean;
};

const DRAIN_AGE_MS = 2 * 60_000;
const STUCK_THRESHOLD_MS = 60 * 60_000;
const VERIFY_WINDOW_MS = 24 * 3_600_000;

export async function runBbpsReconciliation(): Promise<BbpsReconSummary> {
  const ranAt = new Date().toISOString();

  if (!flags.bbps) {
    logger.info({ action: "recon.bbps_skipped", reason: "bbps partner disabled" });
    return { ranAt, drained: 0, settled: 0, refunded: 0, stuck: 0, verified: 0, mismatches: 0, skipped: true };
  }

  const bbps = getPartner("bbps");
  if (!bbps.status) {
    logger.info({ action: "recon.bbps_skipped", reason: "provider has no status method" });
    return { ranAt, drained: 0, settled: 0, refunded: 0, stuck: 0, verified: 0, mismatches: 0, skipped: true };
  }

  const now = Date.now();
  let settled = 0;
  let refunded = 0;

  // 1. DRAIN — poll every PROCESSING BBPS transaction older than 2 minutes.
  const inflight = await prisma.transaction.findMany({
    where: {
      status: "PROCESSING",
      service: { in: BBPS_SERVICES },
      partnerTxnId: { not: null },
      createdAt: { lt: new Date(now - DRAIN_AGE_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      refId: true,
      userId: true,
      partnerTxnId: true,
      amount: true,
      fee: true,
      commission: true,
      service: true,
      partner: true,
      createdAt: true,
    },
  });

  let drained = 0;
  for (const txn of inflight) {
    try {
      const r = await bbps.status({ orderId: txn.partnerTxnId! });
      if (!r.ok) continue;

      if (r.data.status === "PENDING") {
        drained++;
        continue;
      }

      if (r.data.status === "SUCCESS") {
        // Atomic guard: only settle if still PROCESSING (prevents double-settle
        // with a concurrent status-poll that ran between our check and now).
        const updated = await prisma.transaction.updateMany({
          where: { id: txn.id, status: "PROCESSING" },
          data: {
            status: "SUCCESS",
            partnerTxnId: txn.partnerTxnId,
            response: {
              reconSettled: true,
              providerStatus: r.data.status,
              operatorRef: r.data.operatorRef,
              samedayCharge: (r.data as { charge?: number }).charge ?? null,
              samedayAmount: (r.data as { amount?: number }).amount ?? null,
            } as Prisma.InputJsonValue,
          },
        });
        if (updated.count > 0) {
          await prisma.auditLog.create({
            data: {
              userId: txn.userId,
              action: "recon.bbps_settled",
              entity: "Transaction",
              entityId: txn.id,
              meta: { refId: txn.refId, providerStatus: r.data.status },
            },
          });
          void emitWebhookEvent(txn.userId, "txn.success", {
            refId: txn.refId,
            service: txn.service,
            amount: txn.amount.toNumber(),
          });
          settled++;
        }
      } else {
        // FAILED or REFUNDED — reverse the held funds.
        // Canonical key shared with status-poll so only one credit is issued.
        const reserveAmount = round(add(txn.amount.toNumber(), txn.fee.toNumber()));
        const reversalKey = `txn:${txn.userId}:${txn.refId}:reversal:recon`;

        // Atomic guard: only refund if still PROCESSING.
        // Wrap updateMany + creditWallet in a single transaction so the wallet
        // credit is never left undone if the status update committed.
        const refundCount = await prisma.$transaction(async (tx) => {
          const updated = await tx.transaction.updateMany({
            where: { id: txn.id, status: "PROCESSING" },
            data: {
              status: r.data.status === "REFUNDED" ? "REFUNDED" : "FAILED",
              errorCode: "BBPS_PROVIDER_FAILED",
              errorMessage: `Provider reported ${r.data.status} during reconciliation`,
              response: {
                reconSettled: true,
                providerStatus: r.data.status,
                samedayCharge: (r.data as { charge?: number }).charge ?? null,
              } as Prisma.InputJsonValue,
            },
          });
          if (updated.count === 0) return 0;
          await creditWallet({
            userId: txn.userId,
            amount: reserveAmount,
            reason: "REVERSAL",
            refType: "Transaction",
            refId: txn.id,
            idempotencyKey: reversalKey,
          }, tx);
          await tx.auditLog.create({
            data: {
              userId: txn.userId,
              action: "recon.bbps_refunded",
              entity: "Transaction",
              entityId: txn.id,
              meta: { refId: txn.refId, providerStatus: r.data.status },
            },
          });
          return updated.count;
        });
        if (refundCount > 0) {
          void emitWebhookEvent(txn.userId, "txn.failed", {
            refId: txn.refId,
            service: txn.service,
            amount: txn.amount.toNumber(),
            code: "BBPS_PROVIDER_FAILED",
            message: `Bill payment ${r.data.status.toLowerCase()} by provider`,
          });
          refunded++;
        }
      }
      drained++;
    } catch (err) {
      logger.warn({ action: "recon.bbps_poll_failed", txnId: txn.id, err: String(err) });
    }
  }

  // 2. STUCK — escalate anything still PROCESSING after 1 hour.
  const stillStuck = await prisma.transaction.findMany({
    where: {
      status: "PROCESSING",
      service: { in: BBPS_SERVICES },
      createdAt: { lt: new Date(now - STUCK_THRESHOLD_MS) },
    },
    select: { id: true, refId: true, createdAt: true },
  });

  if (stillStuck.length > 0) {
    await sendOpsAlert({
      title: "BBPS transactions stuck in PROCESSING",
      severity: "warning",
      details: {
        count: stillStuck.length,
        oldest: stillStuck[0].createdAt.toISOString(),
        refIds: stillStuck.slice(0, 10).map((r) => r.refId).join(", "),
      },
    });
  }

  // 3. VERIFY — re-check recent terminal BBBS rows against the provider.
  let verified = 0;
  let mismatches = 0;

  // Track the two distinct mismatch directions for separate, actionable alerts:
  //   lostAtSameday  = DB FAILED (we refunded the retailer) but SameDay SUCCESS
  //                    → SameDay debited our wallet but we gave money back → LOSS
  //   falseSuccess   = DB SUCCESS but SameDay FAILED/REFUNDED
  //                    → retailer saw "success" but bill may not have been paid
  const lostAtSameday: Array<{ refId: string; amount: number; userId: string; partnerTxnId: string }> = [];
  const falseSuccess: Array<{ refId: string; amount: number; userId: string }> = [];

  const recentTerminal = await prisma.transaction.findMany({
    where: {
      status: { in: ["SUCCESS", "FAILED"] },
      service: { in: BBPS_SERVICES },
      partnerTxnId: { not: null },
      updatedAt: { gte: new Date(now - VERIFY_WINDOW_MS) },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, refId: true, status: true, partnerTxnId: true, userId: true, amount: true },
  });

  for (const row of recentTerminal) {
    try {
      const r = await bbps.status({ orderId: row.partnerTxnId! });
      if (!r.ok) continue;
      verified++;

      const provStatus = r.data.status;
      const agree =
        (row.status === "SUCCESS" && provStatus === "SUCCESS") ||
        (row.status === "FAILED" && (provStatus === "FAILED" || provStatus === "REFUNDED")) ||
        provStatus === "PENDING";

      if (!agree) {
        mismatches++;
        await prisma.auditLog.create({
          data: {
            userId: row.userId,
            action: "recon.bbps_mismatch",
            entity: "Transaction",
            entityId: row.id,
            meta: {
              refId: row.refId,
              ourStatus: row.status,
              providerStatus: provStatus,
              amount: row.amount.toNumber(),
              ranAt,
            },
          },
        });

        // Classify mismatch direction for targeted ops action.
        if (row.status === "FAILED" && provStatus === "SUCCESS") {
          // LOSS: SameDay processed the payment (debited our wallet) but we
          // marked FAILED and refunded the retailer. Net: we paid the bill but
          // gave the retailer back their money. Manual ops recovery required.
          lostAtSameday.push({
            refId: row.refId,
            amount: row.amount.toNumber(),
            userId: row.userId,
            partnerTxnId: row.partnerTxnId!,
          });
        } else if (row.status === "SUCCESS" && (provStatus === "FAILED" || provStatus === "REFUNDED")) {
          // DB SUCCESS but SameDay FAILED: retailer was shown "success" but bill
          // may not have been paid. SameDay should auto-refund our wallet.
          falseSuccess.push({
            refId: row.refId,
            amount: row.amount.toNumber(),
            userId: row.userId,
          });
        }
      }
    } catch (err) {
      logger.warn({ action: "recon.bbps_verify_failed", txnId: row.id, err: String(err) });
    }
  }

  if (lostAtSameday.length > 0) {
    const totalLoss = lostAtSameday.reduce((s, t) => s + t.amount, 0);
    await sendOpsAlert({
      title: "⚠️ BBPS LOSS: SameDay debited our wallet but we refunded retailer",
      severity: "critical",
      details: {
        count: lostAtSameday.length,
        totalAmount: `₹${totalLoss.toFixed(2)}`,
        refIds: lostAtSameday.slice(0, 10).map((t) => t.refId).join(", "),
        action: "URGENT: Verify SameDay portal — re-debit or absorb these transactions",
        ranAt,
      },
      href: "/dashboard/admin/recon",
    });
  }

  if (falseSuccess.length > 0) {
    const totalFalse = falseSuccess.reduce((s, t) => s + t.amount, 0);
    await sendOpsAlert({
      title: "⚠️ BBPS FALSE SUCCESS: DB SUCCESS but provider says FAILED/REFUNDED",
      severity: "critical",
      details: {
        count: falseSuccess.length,
        totalAmount: `₹${totalFalse.toFixed(2)}`,
        refIds: falseSuccess.slice(0, 10).map((t) => t.refId).join(", "),
        action: "Verify SameDay portal and notify affected retailers if bill was not paid",
        ranAt,
      },
      href: "/dashboard/admin/recon",
    });
  }

  if (mismatches > 0 && lostAtSameday.length === 0 && falseSuccess.length === 0) {
    await sendOpsAlert({
      title: "BBPS ledger has minor status mismatches with provider",
      severity: "warning",
      details: { verified, mismatches, ranAt },
    });
  }

  const summary: BbpsReconSummary = { ranAt, drained, settled, refunded, stuck: stillStuck.length, verified, mismatches, skipped: false };
  await prisma.auditLog.create({
    data: { action: "recon.bbps_recon", entity: "System", meta: { ...summary } },
  });

  return summary;
}
