import { prisma } from "@/lib/db";
import { creditWallet, debitWallet } from "@/lib/ledger";
import { dec, gte, toNumber } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { istDateKey } from "./autosweep";

/**
 * T+1 auto-settlement engine — sweeps each user's AEPS-wallet balance into
 * their PRIMARY wallet on a daily cycle.
 *
 * Idempotency: one CRON run per (user, IST day) enforced by the unique
 * SettlementRun (userId, dayKey, trigger) key, plus ledger idempotency keys on
 * both legs — a retried job can never double-settle.
 *
 * Controls (all runtime-changeable):
 *  - PlatformSetting "settlement.t1": enabled / paused / hour / minAmount
 *  - UserSettlementConfig: per-user enable, pause-until, keep-balance float
 *  - UserLimit.settlementDailyCap / settlementPerTxnCap: per-user ceilings
 */

export type T1UserResult = {
  userId: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  amount?: number;
  detail?: string;
};

async function settleUser(params: {
  userId: string;
  dayKey: string;
  trigger: "CRON" | "MANUAL";
  ranById?: string;
  minAmount: number;
}): Promise<T1UserResult> {
  const { userId, dayKey, trigger, ranById, minAmount } = params;

  // Claim the (user, day, trigger) slot before touching money.
  let runId: string;
  try {
    const run = await prisma.settlementRun.create({
      data: { userId, dayKey, trigger, status: "SKIPPED", detail: "in progress", ranById },
    });
    runId = run.id;
  } catch {
    return { userId, status: "SKIPPED", detail: "already settled today" };
  }

  const finish = async (r: Omit<T1UserResult, "userId">) => {
    await prisma.settlementRun.update({
      where: { id: runId },
      data: {
        status: r.status,
        amount: dec(r.amount ?? 0),
        detail: r.detail,
      },
    });
    return { userId, ...r };
  };

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      aepsBalance: true,
      status: true,
      settlementConfig: true,
      userLimit: { select: { settlementDailyCap: true, settlementPerTxnCap: true } },
    },
  });
  if (!user) return finish({ status: "SKIPPED", detail: "user not found" });
  if (user.status !== "ACTIVE") return finish({ status: "SKIPPED", detail: `user is ${user.status}` });

  const cfg = user.settlementConfig;
  if (trigger === "CRON") {
    if (cfg && !cfg.autoSettleEnabled) return finish({ status: "SKIPPED", detail: "auto-settle disabled" });
    if (cfg?.pausedUntil && cfg.pausedUntil > new Date())
      return finish({ status: "SKIPPED", detail: `paused until ${cfg.pausedUntil.toISOString()}` });
  }

  const keep = dec(cfg?.keepBalance ?? 0);
  let sweepable = dec(user.aepsBalance).sub(keep);
  if (!gte(sweepable, minAmount) || !sweepable.gt(0)) {
    return finish({ status: "SKIPPED", detail: "balance below settlement minimum" });
  }

  // Per-transfer ceiling.
  const defaults = await getSetting("limits.settlement_defaults");
  const perTxnCap = dec(user.userLimit?.settlementPerTxnCap ?? defaults.perTxnCap);
  if (sweepable.gt(perTxnCap)) sweepable = perTxnCap;

  // Daily ceiling (sum of today's successful runs).
  const dailyCap = dec(user.userLimit?.settlementDailyCap ?? defaults.dailyCap);
  const todayAgg = await prisma.settlementRun.aggregate({
    where: { userId, dayKey, status: "SUCCESS" },
    _sum: { amount: true },
  });
  const alreadyToday = dec(todayAgg._sum.amount ?? 0);
  const remaining = dailyCap.sub(alreadyToday);
  if (!remaining.gt(0)) return finish({ status: "SKIPPED", detail: "daily settlement cap reached" });
  if (sweepable.gt(remaining)) sweepable = remaining;

  try {
    const debit = await debitWallet({
      userId,
      amount: sweepable,
      reason: "AEPS_SETTLEMENT",
      walletType: "AEPS",
      refType: "SettlementRun",
      refId: runId,
      note: `T+1 settlement ${dayKey}`,
      idempotencyKey: `t1d:${userId}:${dayKey}:${trigger}`,
    });
    const credit = await creditWallet({
      userId,
      amount: sweepable,
      reason: "SETTLEMENT",
      walletType: "PRIMARY",
      refType: "SettlementRun",
      refId: runId,
      note: `T+1 settlement ${dayKey}`,
      idempotencyKey: `t1c:${userId}:${dayKey}:${trigger}`,
    });
    await prisma.settlementRun.update({
      where: { id: runId },
      data: { walletTxnDebitId: debit.id, walletTxnCreditId: credit.id },
    });
    return finish({ status: "SUCCESS", amount: toNumber(sweepable), detail: null as unknown as string });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "ledger error";
    await prisma.settlementAlert.create({
      data: {
        severity: "CRITICAL",
        title: "T+1 settlement failed",
        userId,
        detail: { dayKey, trigger, error: detail },
      },
    });
    return finish({ status: "FAILED", detail });
  }
}

/** Daily CRON entrypoint — settles every eligible user. */
export async function runT1SettlementSweep(now = new Date()): Promise<{
  processed: number;
  settled: number;
  skipped: number;
  failed: number;
  totalAmount: number;
}> {
  const t1 = await getSetting("settlement.t1");
  if (!t1.enabled || t1.paused) {
    return { processed: 0, settled: 0, skipped: 0, failed: 0, totalAmount: 0 };
  }

  const dayKey = istDateKey(now);
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      role: { in: ["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"] },
      aepsBalance: { gt: 0 },
    },
    select: { id: true },
  });

  let settled = 0;
  let skipped = 0;
  let failed = 0;
  let totalAmount = 0;

  for (const c of candidates) {
    const r = await settleUser({
      userId: c.id,
      dayKey,
      trigger: "CRON",
      minAmount: t1.minAmount,
    });
    if (r.status === "SUCCESS") {
      settled++;
      totalAmount += r.amount ?? 0;
    } else if (r.status === "FAILED") failed++;
    else skipped++;
  }

  if (failed > 0) {
    await prisma.settlementAlert.create({
      data: {
        severity: "WARNING",
        title: `T+1 sweep completed with ${failed} failure(s)`,
        detail: { dayKey, settled, skipped, failed, totalAmount },
      },
    });
  }

  return { processed: candidates.length, settled, skipped, failed, totalAmount };
}

/** Admin "run now" for a single user — bypasses pause but not limits. */
export async function runT1SettlementForUser(
  userId: string,
  ranById: string,
  now = new Date()
): Promise<T1UserResult> {
  const t1 = await getSetting("settlement.t1");
  return settleUser({
    userId,
    dayKey: istDateKey(now),
    trigger: "MANUAL",
    ranById,
    minAmount: t1.minAmount,
  });
}
