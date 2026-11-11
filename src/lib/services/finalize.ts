import { Prisma, type ServiceCode, type TxnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { creditWallet, placeLienHold } from "@/lib/ledger";
import { creditServiceMargin } from "@/lib/commission/revenue";
import { isChargeDrivenService } from "@/lib/scheme/constants";
import { emitWebhookEvent } from "@/lib/platform/webhooks";
import { add, sub, round, dec } from "@/lib/money";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "services/finalize" });

// These finalizers run claim + ledger movements in ONE interactive transaction.
// Give them generous headroom over a potentially high-latency DB link.
const TXN_OPTS = { timeout: 30_000, maxWait: 15_000 } as const;

/**
 * Provider-agnostic terminal finalizer for a service `Transaction` left in a
 * non-terminal state (INITIATED / PROCESSING / NEEDS_REVIEW).
 *
 * This is the SINGLE settle/refund path shared by every out-of-band finalizer
 * (admin resolve, recon sweeps) so a transaction finishes exactly the same way
 * no matter which trigger fires first:
 *
 *   SUCCESS            → mark SUCCESS, book company margin for BBPS/RechargeKit.
 *   FAILED | REFUNDED  → mark terminal status, REVERSAL-credit the held reserve
 *                        (amount + fee) back to the wallet.
 *
 * At-most-once: conditional status claim (`updateMany` scoped to non-terminal
 * set). Whoever transitions the row first wins; every later caller is a no-op.
 * Ledger writes are additionally idempotency-keyed, so even a replay cannot
 * double-credit.
 */
export type FinalizableTxn = {
  id: string;
  refId: string;
  userId: string;
  amount: Prisma.Decimal;
  fee: Prisma.Decimal;
  gst: Prisma.Decimal;
  vendorCharge: Prisma.Decimal;
  service: ServiceCode;
  status: TxnStatus;
  partner: string | null;
  partnerTxnId: string | null;
};

const NON_TERMINAL: TxnStatus[] = ["INITIATED", "PROCESSING", "NEEDS_REVIEW"];

export type FinalizeOutcome = "settled" | "refunded" | "noop";

export async function finalizeServiceTransaction(opts: {
  txn: FinalizableTxn;
  status: "SUCCESS" | "FAILED" | "REFUNDED";
  partnerTxnId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw?: unknown;
  source: string;
}): Promise<{ finalized: boolean; outcome: FinalizeOutcome }> {
  const { txn, status, source } = opts;
  const partnerTxnId = opts.partnerTxnId ?? txn.partnerTxnId ?? null;
  const raw = (opts.raw ?? null) as Prisma.InputJsonValue;

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (status === "SUCCESS") {
    let finalized = false;
    await prisma.$transaction(async (tx) => {
      const claim = await tx.transaction.updateMany({
        where: { id: txn.id, status: { in: NON_TERMINAL } },
        data: { status: "SUCCESS", partnerTxnId, response: raw },
      });
      if (claim.count === 0) return;
      finalized = true;

      if (isChargeDrivenService(txn.service)) {
        const margin = round(
          sub(sub(txn.fee.toNumber(), txn.gst.toNumber()), txn.vendorCharge.toNumber())
        );
        await creditServiceMargin(txn.id, txn.service, margin, tx);
      }

      await tx.auditLog.create({
        data: {
          userId: txn.userId,
          action: `txn.${source}_settled`,
          entity: "Transaction",
          entityId: txn.id,
          meta: { refId: txn.refId, source, partner: txn.partner },
        },
      });
    }, TXN_OPTS);

    if (finalized) {
      void emitWebhookEvent(txn.userId, "txn.success", {
        refId: txn.refId,
        service: txn.service,
        amount: txn.amount.toNumber(),
      });
      log.info({ refId: txn.refId, source }, "service txn settled via out-of-band finalizer");
    }
    return { finalized, outcome: finalized ? "settled" : "noop" };
  }

  // ── FAILED / REFUNDED — credit the held reserve back to the wallet ────────
  const reserveAmount = round(add(txn.amount.toNumber(), txn.fee.toNumber()));
  const terminal: TxnStatus = status === "REFUNDED" ? "REFUNDED" : "FAILED";
  const reversalKey = `txn:${txn.userId}:${txn.refId}:reversal`;
  let finalized = false;
  await prisma.$transaction(async (tx) => {
    const claim = await tx.transaction.updateMany({
      where: { id: txn.id, status: { in: NON_TERMINAL } },
      data: {
        status: terminal,
        partnerTxnId,
        errorCode: opts.errorCode ?? `PROVIDER_${status}`,
        errorMessage: opts.errorMessage || `Provider reported ${status} for ${txn.refId}`,
        response: raw,
      },
    });
    if (claim.count === 0) return;
    finalized = true;

    await creditWallet(
      {
        userId: txn.userId,
        amount: reserveAmount,
        reason: "REVERSAL",
        refType: "Transaction",
        refId: txn.id,
        idempotencyKey: reversalKey,
      },
      tx
    );

    await tx.auditLog.create({
      data: {
        userId: txn.userId,
        action: `txn.${source}_refunded`,
        entity: "Transaction",
        entityId: txn.id,
        meta: { refId: txn.refId, source, providerStatus: status, partner: txn.partner },
      },
    });
  }, TXN_OPTS);

  if (finalized) {
    void emitWebhookEvent(txn.userId, "txn.failed", {
      refId: txn.refId,
      service: txn.service,
      amount: txn.amount.toNumber(),
      code: opts.errorCode ?? `PROVIDER_${status}`,
      message: opts.errorMessage ?? `Transaction ${status.toLowerCase()} at provider`,
    });
    log.info({ refId: txn.refId, source, status }, "service txn refunded via out-of-band finalizer");
  }
  return { finalized, outcome: finalized ? "refunded" : "noop" };
}

/**
 * CORRECTIVE finalizer: promote an already-TERMINAL FAILED/REFUNDED transaction
 * to SUCCESS after the provider's authoritative outcome proves the money DID
 * move. The ordinary finalizer only acts on non-terminal rows; this is the
 * single, audited, admin-triggered path that can repair a wrongly-failed row.
 *
 * Safety:
 *   1. At-most-once — status claim scoped to `FAILED | REFUNDED`.
 *   2. Clawback WITHOUT a negative wallet — if the retailer was refunded
 *      earlier, the refunded reserve is recovered through a LIEN: sweeps
 *      available funds now, recovers the rest from every future credit. The
 *      wallet is never driven negative.
 */
export async function correctTerminalToSuccess(opts: {
  txn: FinalizableTxn;
  partnerTxnId?: string | null;
  raw?: unknown;
  actorId: string;
  source: string;
  remarks?: string;
}): Promise<{
  corrected: boolean;
  clawbackPlaced: boolean;
  lienId: string | null;
  refunded: number;
}> {
  const { txn, actorId, source } = opts;
  const partnerTxnId = opts.partnerTxnId ?? txn.partnerTxnId ?? null;
  const raw = (opts.raw ?? null) as Prisma.InputJsonValue;

  let corrected = false;
  let clawbackPlaced = false;
  let lienId: string | null = null;
  let refunded = 0;

  await prisma.$transaction(async (tx) => {
    const claim = await tx.transaction.updateMany({
      where: { id: txn.id, status: { in: ["FAILED", "REFUNDED"] } },
      data: { status: "SUCCESS", partnerTxnId, errorCode: null, errorMessage: null, response: raw },
    });
    if (claim.count === 0) return;
    corrected = true;

    // Detect the refund via the DURABLE ledger link (REVERSAL credit pointing at
    // this Transaction) so we don't miss refunds written under non-standard keys.
    const reversalAgg = await tx.walletTxn.aggregate({
      where: {
        userId: txn.userId,
        direction: "CREDIT",
        reason: "REVERSAL",
        refType: "Transaction",
        refId: txn.id,
      },
      _sum: { amount: true },
    });
    const refundedAmt = reversalAgg._sum?.amount?.toNumber() ?? 0;
    if (refundedAmt > 0) {
      refunded = refundedAmt;
      const lien = await tx.walletLien.create({
        data: {
          targetUserId: txn.userId,
          actorId,
          amount: dec(refunded),
          reasonCode: "OTHER",
          remarks:
            opts.remarks?.trim() ||
            `Corrective clawback — provider-confirmed SUCCESS on wrongly-refunded txn ${txn.refId}`,
          refType: "Transaction",
          refId: txn.id,
          status: "ACTIVE",
        },
      });
      lienId = lien.id;
      await placeLienHold(txn.userId, refunded, tx);
      clawbackPlaced = true;
      await tx.notification.create({
        data: {
          userId: txn.userId,
          title: "A wallet hold was placed to recover a refund",
          body: `₹${refunded.toFixed(2)} from txn ${txn.refId} is being recovered: the provider confirmed this payment actually succeeded, so the earlier refund is reversed via a recovery hold (not a negative balance).`,
          channel: "INAPP",
          href: "/dashboard/wallet",
        },
      });
    }

    if (isChargeDrivenService(txn.service)) {
      const margin = round(
        sub(sub(txn.fee.toNumber(), txn.gst.toNumber()), txn.vendorCharge.toNumber())
      );
      await creditServiceMargin(txn.id, txn.service, margin, tx);
    }

    await tx.auditLog.create({
      data: {
        userId: txn.userId,
        action: "txn.corrected_to_success",
        entity: "Transaction",
        entityId: txn.id,
        meta: {
          refId: txn.refId, source, actorId,
          refunded, clawbackPlaced, lienId, partner: txn.partner,
        },
      },
    });
  }, TXN_OPTS);

  if (corrected) {
    void emitWebhookEvent(txn.userId, "txn.success", {
      refId: txn.refId,
      service: txn.service,
      amount: txn.amount.toNumber(),
    });
    log.info({ refId: txn.refId, source, clawbackPlaced, refunded }, "terminal txn corrected to SUCCESS");
  }
  return { corrected, clawbackPlaced, lienId, refunded };
}

/** Column set required by {@link finalizeServiceTransaction}. */
export const FINALIZABLE_TXN_SELECT = {
  id: true,
  refId: true,
  userId: true,
  amount: true,
  fee: true,
  gst: true,
  vendorCharge: true,
  service: true,
  status: true,
  partner: true,
  partnerTxnId: true,
} satisfies Prisma.TransactionSelect;
