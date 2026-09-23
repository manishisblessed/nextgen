import type { IncentiveScheme, IncentiveTier, UserIncentiveConfig } from "@prisma/client";
import { prisma } from "@/lib/db";
import { creditWallet, LedgerError } from "@/lib/ledger";
import { dec, mul, round, gte, gt, toNumber, type Money } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { measureRailVolume, type RailVolume } from "./volume";

/**
 * Monthly volume-incentive engine — the retailer reward / reverse-cashback
 * layer. On the last IST day of the month it walks every active IncentiveScheme,
 * measures each assigned user's monthly volume on the scheme's rail, matches it
 * to a reward tier ("slab"), and credits the reward (e.g. reverse cashback = a %
 * of the MDR the user paid that month) to their wallet.
 *
 * Idempotency: exactly one IncentivePayout per (user, scheme, YYYY-MM) via the
 * unique key, and the wallet credit shares idempotency key
 * `incentive:<user>:<scheme>:<period>`, so a re-run in the same period never
 * double-pays.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** IST calendar parts (year, 1-indexed month, day) for a UTC instant. */
function istYmd(now: Date): { y: number; m: number; d: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

/** UTC instant of IST-midnight on (year, 1-indexed month, day). Overflow normalizes. */
function istMidnight(y: number, month1: number, day: number): Date {
  return new Date(Date.UTC(y, month1 - 1, day) - IST_OFFSET_MS);
}

/** IST billing period key (YYYY-MM) for an instant. */
export function istPeriodKey(now: Date = new Date()): string {
  const { y, m } = istYmd(now);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** [start, end) UTC instants spanning the IST calendar month of `periodKey`. */
export function periodBounds(periodKey: string): { start: Date; end: Date } {
  const [ys, ms] = periodKey.split("-");
  const y = Number(ys);
  const m = Number(ms); // 1-12
  return { start: istMidnight(y, m, 1), end: istMidnight(y, m + 1, 1) };
}

/** True when `now` falls on the last day of its IST calendar month. */
export function isLastIstDayOfMonth(now: Date = new Date()): boolean {
  const today = istYmd(now);
  const tomorrow = istYmd(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return tomorrow.m !== today.m;
}

// ---------------------------------------------------------------------------
// Tier resolution + reward computation
// ---------------------------------------------------------------------------

export type ResolvedTier = {
  tier: IncentiveTier;
  /** Effective entry threshold after any per-user override (₹). */
  effectiveMin: Money;
  /** Effective reward rate after any per-user override (fraction or ₹). */
  effectiveRate: Money;
};

/**
 * Pick the reward tier a user qualifies for given their monthly `volume`.
 *
 * Whole-month model: the HIGHEST tier whose (effective) entry threshold is met
 * applies to the whole month's base. A per-user `config.minAmount` override
 * shifts the entry threshold of the LOWEST tier (e.g. the scheme defaults to
 * ₹20 lakh but this retailer unlocks at ₹15 lakh); `config.rewardValue`
 * overrides the rate for every tier this user hits.
 */
export function resolveTier(
  tiers: IncentiveTier[],
  config: Pick<UserIncentiveConfig, "minAmount" | "rewardValue"> | null,
  volume: Money
): ResolvedTier | null {
  const active = tiers
    .filter((t) => t.active)
    .sort((a, b) => (gt(a.minAmount, b.minAmount) ? 1 : -1));
  if (active.length === 0) return null;

  const lowestId = active[0].id;
  const overrideMin = config?.minAmount ?? null;
  const overrideRate = config?.rewardValue ?? null;

  let best: ResolvedTier | null = null;
  for (const t of active) {
    const effectiveMin =
      overrideMin != null && t.id === lowestId ? dec(overrideMin) : dec(t.minAmount);
    if (!gte(volume, effectiveMin)) continue;
    // Highest qualifying tier wins (list is ascending, so last match is highest).
    best = {
      tier: t,
      effectiveMin,
      effectiveRate: overrideRate != null ? dec(overrideRate) : dec(t.rewardValue),
    };
  }
  return best;
}

/**
 * Compute the reward amount (₹, rounded to money scale) for a resolved tier.
 *   - CASHBACK_ON_MDR    → base = mdrPaid
 *   - CASHBACK_ON_VOLUME → base = gross volume
 *   - FLAT (scheme)      → flat ₹ = the effective rate (base ignored)
 * The tier's rewardType decides PERCENT (rate × base) vs FLAT (flat ₹).
 */
export function computeReward(
  scheme: Pick<IncentiveScheme, "rewardType">,
  resolved: ResolvedTier,
  vol: RailVolume
): Money {
  const rate = resolved.effectiveRate;
  if (scheme.rewardType === "FLAT") return round(rate);
  const base = scheme.rewardType === "CASHBACK_ON_MDR" ? vol.mdrPaid : vol.volume;
  if (resolved.tier.rewardType === "FLAT") return round(rate);
  return round(mul(base, rate));
}

// ---------------------------------------------------------------------------
// Month-end run
// ---------------------------------------------------------------------------

export type IncentiveRunResult = {
  skippedRun: boolean;
  periodKey: string;
  schemes: number;
  users: number;
  paid: number;
  skipped: number;
  failed: number;
  totalRewarded: number;
};

export type RunOptions = {
  /** Ignore the enabled/last-day gates (admin "run now" / preview). */
  force?: boolean;
  /** Compute but do not credit or persist (preview). */
  dryRun?: boolean;
  /** Settle a specific period instead of the current IST month. */
  periodKey?: string;
};

/**
 * Run the monthly incentive engine. Called by the worker on the last IST day of
 * the month, or by the admin "run now / preview" endpoint.
 */
export async function runMonthlyIncentives(
  now: Date = new Date(),
  opts: RunOptions = {}
): Promise<IncentiveRunResult> {
  const cfg = await getSetting("incentive.monthly");
  const periodKey = opts.periodKey ?? istPeriodKey(now);
  const result: IncentiveRunResult = {
    skippedRun: false,
    periodKey,
    schemes: 0,
    users: 0,
    paid: 0,
    skipped: 0,
    failed: 0,
    totalRewarded: 0,
  };

  if (!opts.force && !cfg.enabled) {
    result.skippedRun = true;
    return result;
  }

  const { start, end } = periodBounds(periodKey);
  const minReward = dec(cfg.minAmount);

  const schemes = await prisma.incentiveScheme.findMany({
    where: { active: true },
    include: {
      tiers: true,
      configs: {
        where: { active: true },
        include: { user: { select: { id: true, status: true, deletedAt: true } } },
      },
    },
  });

  for (const scheme of schemes) {
    result.schemes++;
    for (const config of scheme.configs) {
      // Skip deleted / non-active accounts entirely.
      if (config.user.deletedAt || config.user.status !== "ACTIVE") continue;
      result.users++;

      const vol = await measureRailVolume(config.userId, scheme.rail, start, end);
      const resolved = resolveTier(scheme.tiers, config, vol.volume);

      if (!resolved) {
        result.skipped++;
        if (!opts.dryRun) {
          await upsertPayout(scheme.id, config.userId, periodKey, scheme.rail, {
            tierId: null,
            measuredVolume: vol.volume,
            mdrPaid: vol.mdrPaid,
            rewardAmount: dec(0),
            status: "SKIPPED",
            detail: "No reward tier reached this month",
          });
        }
        continue;
      }

      const reward = computeReward(scheme, resolved, vol);

      if (!gt(reward, 0) || !gte(reward, minReward)) {
        result.skipped++;
        if (!opts.dryRun) {
          await upsertPayout(scheme.id, config.userId, periodKey, scheme.rail, {
            tierId: resolved.tier.id,
            measuredVolume: vol.volume,
            mdrPaid: vol.mdrPaid,
            rewardAmount: reward,
            status: "SKIPPED",
            detail: `Reward ₹${toNumber(reward)} below the ₹${toNumber(minReward)} minimum`,
          });
        }
        continue;
      }

      if (opts.dryRun) {
        result.paid++;
        result.totalRewarded += toNumber(reward);
        continue;
      }

      // Skip if already paid this period (defensive — the credit is idempotent too).
      const existing = await prisma.incentivePayout.findUnique({
        where: {
          userId_schemeId_periodKey: {
            userId: config.userId,
            schemeId: scheme.id,
            periodKey,
          },
        },
      });
      if (existing && existing.status === "PAID") {
        result.paid++;
        result.totalRewarded += toNumber(existing.rewardAmount);
        continue;
      }

      try {
        const txn = await creditWallet({
          userId: config.userId,
          amount: reward,
          reason: "INCENTIVE",
          refType: "IncentivePayout",
          refId: `${scheme.id}:${periodKey}`,
          note: rewardNote(scheme, resolved, vol, periodKey),
          idempotencyKey: `incentive:${config.userId}:${scheme.id}:${periodKey}`,
        });
        await upsertPayout(scheme.id, config.userId, periodKey, scheme.rail, {
          tierId: resolved.tier.id,
          measuredVolume: vol.volume,
          mdrPaid: vol.mdrPaid,
          rewardAmount: reward,
          status: "PAID",
          walletTxnId: txn.id,
          detail: null,
        });
        result.paid++;
        result.totalRewarded += toNumber(reward);
      } catch (e) {
        const detail = e instanceof LedgerError ? e.code : e instanceof Error ? e.message : "ledger error";
        await upsertPayout(scheme.id, config.userId, periodKey, scheme.rail, {
          tierId: resolved.tier.id,
          measuredVolume: vol.volume,
          mdrPaid: vol.mdrPaid,
          rewardAmount: reward,
          status: "FAILED",
          detail,
        });
        result.failed++;
      }
    }
  }

  return result;
}

function rewardNote(
  scheme: Pick<IncentiveScheme, "name" | "rewardType" | "rail">,
  resolved: ResolvedTier,
  vol: RailVolume,
  periodKey: string
): string {
  const tierLabel = resolved.tier.label ? ` (${resolved.tier.label})` : "";
  const base =
    scheme.rewardType === "CASHBACK_ON_MDR"
      ? `MDR ₹${toNumber(vol.mdrPaid)}`
      : `volume ₹${toNumber(vol.volume)}`;
  return `${scheme.name}${tierLabel} · ${scheme.rail} ${periodKey} reward on ${base}`;
}

type PayoutData = {
  tierId: string | null;
  measuredVolume: Money;
  mdrPaid: Money;
  rewardAmount: Money;
  status: string;
  walletTxnId?: string | null;
  detail?: string | null;
};

async function upsertPayout(
  schemeId: string,
  userId: string,
  periodKey: string,
  rail: IncentiveScheme["rail"],
  data: PayoutData
): Promise<void> {
  await prisma.incentivePayout.upsert({
    where: { userId_schemeId_periodKey: { userId, schemeId, periodKey } },
    update: {
      tierId: data.tierId,
      rail,
      measuredVolume: data.measuredVolume,
      mdrPaid: data.mdrPaid,
      rewardAmount: data.rewardAmount,
      status: data.status,
      walletTxnId: data.walletTxnId ?? null,
      detail: data.detail ?? null,
    },
    create: {
      userId,
      schemeId,
      periodKey,
      rail,
      tierId: data.tierId,
      measuredVolume: data.measuredVolume,
      mdrPaid: data.mdrPaid,
      rewardAmount: data.rewardAmount,
      status: data.status,
      walletTxnId: data.walletTxnId ?? null,
      detail: data.detail ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Retailer progress (live, current month)
// ---------------------------------------------------------------------------

export type IncentiveProgress = {
  schemeId: string;
  schemeName: string;
  description: string | null;
  rail: IncentiveScheme["rail"];
  rewardType: IncentiveScheme["rewardType"];
  periodKey: string;
  volume: number;
  mdrPaid: number;
  /** Tier currently reached (null if below the lowest threshold). */
  currentTier: { id: string; label: string | null; rate: number; rewardType: string } | null;
  /** Reward earned so far this month if the month closed now (₹). */
  projectedReward: number;
  /** Entry threshold of the lowest tier for this user (₹). */
  entryThreshold: number;
  /** Next tier to chase, if any. */
  nextTier: { id: string; label: string | null; threshold: number; remaining: number; rate: number } | null;
  /** Progress toward the next milestone (0..1). */
  progress: number;
  achieved: boolean;
};

/**
 * Live current-month progress across every incentive scheme a user is assigned
 * to. Powers the retailer Rewards page (gamified tier progress).
 */
export async function getUserIncentiveProgress(
  userId: string,
  now: Date = new Date()
): Promise<IncentiveProgress[]> {
  const periodKey = istPeriodKey(now);
  const { start } = periodBounds(periodKey);
  const configs = await prisma.userIncentiveConfig.findMany({
    where: { userId, active: true, scheme: { active: true } },
    include: { scheme: { include: { tiers: true } } },
  });

  const out: IncentiveProgress[] = [];
  for (const config of configs) {
    const scheme = config.scheme;
    const vol = await measureRailVolume(userId, scheme.rail, start, now);
    const resolved = resolveTier(scheme.tiers, config, vol.volume);

    const activeTiers = scheme.tiers
      .filter((t) => t.active)
      .sort((a, b) => (gt(a.minAmount, b.minAmount) ? 1 : -1));
    const lowestId = activeTiers[0]?.id;
    const overrideMin = config.minAmount;
    const entryThreshold = activeTiers[0]
      ? overrideMin != null
        ? toNumber(overrideMin)
        : toNumber(activeTiers[0].minAmount)
      : 0;

    const effMin = (t: IncentiveTier) =>
      overrideMin != null && t.id === lowestId ? dec(overrideMin) : dec(t.minAmount);

    // The next tier above the current one (the milestone to chase).
    const next = activeTiers.find((t) => gt(effMin(t), vol.volume)) ?? null;

    const projectedReward = resolved ? toNumber(computeReward(scheme, resolved, vol)) : 0;

    // Progress: toward the next milestone, or full if the top tier is reached.
    let progress = 1;
    if (next) {
      const target = toNumber(effMin(next));
      progress = target > 0 ? Math.min(1, toNumber(vol.volume) / target) : 0;
    } else if (!resolved) {
      progress = entryThreshold > 0 ? Math.min(1, toNumber(vol.volume) / entryThreshold) : 0;
    }

    out.push({
      schemeId: scheme.id,
      schemeName: scheme.name,
      description: scheme.description,
      rail: scheme.rail,
      rewardType: scheme.rewardType,
      periodKey,
      volume: toNumber(vol.volume),
      mdrPaid: toNumber(vol.mdrPaid),
      currentTier: resolved
        ? {
            id: resolved.tier.id,
            label: resolved.tier.label,
            rate: toNumber(resolved.effectiveRate),
            rewardType: resolved.tier.rewardType,
          }
        : null,
      projectedReward,
      entryThreshold,
      nextTier: next
        ? {
            id: next.id,
            label: next.label,
            threshold: toNumber(effMin(next)),
            remaining: Math.max(0, toNumber(effMin(next)) - toNumber(vol.volume)),
            rate:
              config.rewardValue != null ? toNumber(config.rewardValue) : toNumber(next.rewardValue),
          }
        : null,
      progress,
      achieved: !!resolved && !next,
    });
  }
  return out;
}
