import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";
import { getEffectiveMdr } from "@/lib/mdr/resolver";
import { distributeMdrCommission } from "@/lib/commission/distribute";
import { dec, sub, gte, toNumber, round, gt } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import type { MdrServiceKind, ServiceCode } from "@prisma/client";

/**
 * POS acquirer settlement engine.
 *
 * Two modes (admin-toggled per user or globally):
 *   - INSTANT: credit happens synchronously when the webhook arrives.
 *   - T+1:     an entry is queued PENDING and swept by the daily worker cron
 *              (QUEUES.POS_SETTLEMENT_T1) at the configured IST hour; only
 *              entries captured BEFORE the current IST day settle (true T+1).
 *
 * Flow:
 *   1. `handlePosCapture` — called from the webhook handler when Same Day
 *      confirms a card/UPI/NFC capture.
 *   2. MDR is resolved via the machine owner's own MdrScheme (cascade model —
 *      no scheme means the capture is parked as NO_SCHEME for admin replay).
 *   3. MDR-margin commission (net of 2% TDS) is distributed to the chain.
 *   4. Net proceeds are either credited immediately or queued for T+1.
 */

export type PosCaptureInput = {
  transactionRef: string;   // partner's unique txn ID (idempotency)
  machineId?: string;       // local PosMachine id
  terminalId?: string;      // partner TID (used to look up machine + user)
  grossAmount: number;
  paymentMode?: string;     // CARD | UPI | NFC | BHARATQR
};

export type PosCaptureResult = {
  status: "SETTLED" | "QUEUED" | "DUPLICATE" | "SKIPPED" | "NO_SCHEME";
  netAmount?: number;
  mdrAmount?: number;
  mode?: string;
};

export async function handlePosCapture(input: PosCaptureInput): Promise<PosCaptureResult> {
  // Idempotency — if we already processed this capture, skip.
  const existing = await prisma.posSettlementEntry.findUnique({
    where: { transactionRef: input.transactionRef },
  });
  if (existing) return { status: "DUPLICATE" };

  // Resolve the machine and its assigned user.
  let userId: string | null = null;
  let machineDbId: string | null = input.machineId ?? null;

  if (!machineDbId && input.terminalId) {
    const machine = await prisma.posMachine.findFirst({
      where: { tid: input.terminalId, assignedUserId: { not: null } },
      select: { id: true, assignedUserId: true },
    });
    if (machine) {
      machineDbId = machine.id;
      userId = machine.assignedUserId;
    }
  } else if (machineDbId) {
    const machine = await prisma.posMachine.findUnique({
      where: { id: machineDbId },
      select: { assignedUserId: true },
    });
    userId = machine?.assignedUserId ?? null;
  }

  if (!userId) return { status: "SKIPPED" };

  // Resolve MDR from the owner's OWN MdrScheme (cascade model). A capture on
  // a machine whose owner has no active MDR scheme cannot be priced — park it
  // so admin can assign a scheme and replay the webhook. (The card was already
  // swiped, so we can't reject; we just refuse to settle unpriced money.)
  const mdr = await getEffectiveMdr(userId, "POS" as MdrServiceKind, input.grossAmount, input.paymentMode ?? "*");
  if (mdr.source === "NONE") return { status: "NO_SCHEME" };
  const mdrAmount = mdr.mdr;
  const netAmount = round(sub(input.grossAmount, mdrAmount));
  if (!gt(netAmount, 0)) return { status: "SKIPPED" };

  // Check if this user has instant settlement enabled.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { instantSettlement: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return { status: "SKIPPED" };

  const globalInstant = await getSetting("settlement.pos_instant");
  const isInstant = user.instantSettlement || globalInstant.defaultEnabled;

  if (isInstant) {
    // Instant settlement — credit the wallet now.
    const wtxn = await creditWallet({
      userId,
      amount: netAmount,
      reason: "POS_SETTLEMENT",
      refType: "PosSettlementEntry",
      refId: input.transactionRef,
      note: `POS instant settlement (${input.paymentMode ?? "card"})`,
      idempotencyKey: `pos-settle:${input.transactionRef}`,
    });

    await prisma.posSettlementEntry.create({
      data: {
        transactionRef: input.transactionRef,
        machineId: machineDbId,
        userId,
        grossAmount: dec(input.grossAmount),
        mdrAmount: dec(mdrAmount),
        netAmount: dec(netAmount),
        mode: "INSTANT",
        status: "SETTLED",
        settledAt: new Date(),
        walletTxnId: wtxn.id,
        paymentMode: input.paymentMode,
      },
    });

    // Distribute MDR-margin commission (net of TDS) to the chain.
    await distributeCommissionForPos(input.transactionRef, userId, input.grossAmount, input.paymentMode);

    return {
      status: "SETTLED",
      netAmount: toNumber(netAmount),
      mdrAmount: toNumber(mdrAmount),
      mode: "INSTANT",
    };
  }

  // T+1 — queue for the daily cron.
  await prisma.posSettlementEntry.create({
    data: {
      transactionRef: input.transactionRef,
      machineId: machineDbId,
      userId,
      grossAmount: dec(input.grossAmount),
      mdrAmount: dec(mdrAmount),
      netAmount: dec(netAmount),
      mode: "T1",
      status: "PENDING",
      paymentMode: input.paymentMode,
    },
  });

  // Commission still distributes instantly even in T+1 mode.
  await distributeCommissionForPos(input.transactionRef, userId, input.grossAmount, input.paymentMode);

  return {
    status: "QUEUED",
    netAmount: toNumber(netAmount),
    mdrAmount: toNumber(mdrAmount),
    mode: "T1",
  };
}

/**
 * POS commission distribution (cascade model): each ancestor earns the MDR
 * margin between their child's MdrScheme and their own, net of 2% TDS.
 * Creates a placeholder Transaction for the CommissionCredit FK, then
 * distributes via the MDR chain.
 */
async function distributeCommissionForPos(
  transactionRef: string,
  userId: string,
  grossAmount: number,
  paymentMode?: string
) {
  // We need a Transaction row for the CommissionCredit FK. Create a synthetic
  // settlement-type entry. Idempotent per capture via the unique refId.
  const refId = `POS${transactionRef.slice(-10).toUpperCase()}`;
  let txn = await prisma.transaction.findUnique({ where: { refId } });
  if (!txn) {
    txn = await prisma.transaction.create({
      data: {
        refId,
        userId,
        service: "WALLET_TOPUP" as ServiceCode, // POS settlement doesn't have its own ServiceCode; use placeholder
        amount: dec(grossAmount),
        status: "SUCCESS",
        partner: "SAMEDAY_POS",
        partnerTxnId: transactionRef,
      },
    });
  }

  await distributeMdrCommission(
    txn.id,
    userId,
    "POS" as MdrServiceKind,
    grossAmount,
    txn.service,
    paymentMode ?? "*"
  );
}

/** Start of the current IST calendar day, as a UTC Date. */
function startOfTodayIst(now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const startIstMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(startIstMs - 5.5 * 60 * 60 * 1000);
}

/**
 * T+1 cron: settle PENDING POS entries captured BEFORE the current IST day
 * into retailer wallets. Called by the worker at the configured hour
 * (default 09:00 IST); also invocable manually via the admin API.
 */
export async function runPosT1SettlementSweep(): Promise<{
  processed: number;
  settled: number;
  failed: number;
  totalAmount: number;
}> {
  const config = await getSetting("settlement.pos_t1");
  if (!config.enabled || config.paused) {
    return { processed: 0, settled: 0, failed: 0, totalAmount: 0 };
  }

  const entries = await prisma.posSettlementEntry.findMany({
    where: {
      status: "PENDING",
      mode: "T1",
      // True T+1: only captures from previous IST days are due.
      createdAt: { lt: startOfTodayIst() },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  let settled = 0;
  let failed = 0;
  let totalAmount = 0;

  for (const entry of entries) {
    if (!gte(entry.netAmount, config.minAmount)) {
      continue; // Below minimum — leave for next run
    }

    try {
      const wtxn = await creditWallet({
        userId: entry.userId,
        amount: entry.netAmount,
        reason: "POS_SETTLEMENT",
        refType: "PosSettlementEntry",
        refId: entry.id,
        note: `POS T+1 settlement (${entry.paymentMode ?? "card"})`,
        idempotencyKey: `pos-settle:${entry.transactionRef}`,
      });

      await prisma.posSettlementEntry.update({
        where: { id: entry.id },
        data: {
          status: "SETTLED",
          settledAt: new Date(),
          walletTxnId: wtxn.id,
        },
      });

      settled++;
      totalAmount += toNumber(entry.netAmount);
    } catch {
      await prisma.posSettlementEntry.update({
        where: { id: entry.id },
        data: { status: "FAILED" },
      });
      failed++;
    }
  }

  return { processed: entries.length, settled, failed, totalAmount };
}
