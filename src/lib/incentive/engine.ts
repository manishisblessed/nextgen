import type {
  IncentiveScheme,
  IncentiveTier,
  UserIncentiveConfig,
  IncentiveLeg,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { creditWallet, LedgerError } from "@/lib/ledger";
import { dec, mul, round, gte, gt, toNumber, type Money } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { measureRailVolume, type RailVolume, type SplitVolume } from "./volume";

/**
 * Monthly volume-incentive engine — the retailer reward / reverse-cashback
 * layer. On the last IST day of the month it walks every active IncentiveScheme,
 * measures each assigned user's monthly volume on the scheme's rail, matches it
 * to a reward tier ("slab"), and credits the reward (e.g. reverse cashback = a %
 * of the MDR the user paid that month) to their wallet.
 *
 * Per-leg independence: the reward is computed, credited and recorded
 * INDEPENDENTLY for the INSTANT (T+0) and T1 (next-day) settlement legs. Tier
 * qualification uses the TOTAL monthly volume (the milestone the retailer
 * chases), but each leg is then rewarded at its OWN rate on its OWN base and
 * gets its OWN wallet credit + IncentivePayout row. Reports can therefore show
 * one leg at a time or both together.
 *
 * Idempotency: exactly one IncentivePayout per (user, scheme, YYYY-MM, leg) via
 * the unique key, and each leg's wallet credit uses idempotency key
 * `incentive:<user>:<scheme>:<period>:<leg>`, so a re-run in the same period
 * never double-pays either leg.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The two settlement legs, in report order. */
export const LEGS: IncentiveLeg[] = ["INSTANT", "T1"];

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

type IncentiveConfigRates = Pick<
  UserIncentiveConfig,
  "minAmount" | "rewardValue" | "rewardValueT0"
>;

export type ResolvedTier = {
  tier: IncentiveTier;
  /** Effective entry threshold after any per-user override (₹). */
  effectiveMin: Money;
  /** Effective T+1 (standard) reward rate after any per-user override. */
  effectiveRateT1: Money;
  /** Effective T+0 (instant) reward rate after fallback + any per-user override. */
  effectiveRateT0: Money;
};

/**
 * Effective per-leg rates for a single tier, applying per-user overrides and the
 * T0→T1 fallback (a tier `rewardValueT0` of 0 means "reward instant at the same
 * rate as T+1"). A per-user override wins for its own leg.
 */
function effectiveRatesFor(
  tier: IncentiveTier,
  config: IncentiveConfigRates | null
): { t1: Money; t0: Money } {
  const overrideT1 = config?.rewardValue ?? null;
  const overrideT0 = config?.rewardValueT0 ?? null;
  const t1 = overrideT1 != null ? dec(overrideT1) : dec(tier.rewardValue);
  const tierT0 = dec(tier.rewardValueT0);
  const baseT0 = gt(tierT0, 0) ? tierT0 : t1; // 0 ⇒ follow the effective T+1 rate
  const t0 = overrideT0 != null ? dec(overrideT0) : baseT0;
  return { t1, t0 };
}

/**
 * Pick the reward tier a user qualifies for given their TOTAL monthly `volume`
 * (both legs combined — the milestone they chase). A per-user `config.minAmount`
 * override shifts the entry threshold of the LOWEST tier; rate overrides are
 * applied per leg in {@link effectiveRatesFor}.
 */
export function resolveTier(
  tiers: IncentiveTier[],
  config: IncentiveConfigRates | null,
  volume: Money
): ResolvedTier | null {
  const active = tiers
    .filter((t) => t.active)
    .sort((a, b) => (gt(a.minAmount, b.minAmount) ? 1 : -1));
  if (active.length === 0) return null;

  const lowestId = active[0].id;
  const overrideMin = config?.minAmount ?? null;

  let best: ResolvedTier | null = null;
  for (const t of active) {
    const effectiveMin =
      overrideMin != null && t.id === lowestId ? dec(overrideMin) : dec(t.minAmount);
    if (!gte(volume, effectiveMin)) continue;
    // Highest qualifying tier wins (list is ascending, so last match is highest).
    const rates = effectiveRatesFor(t, config);
    best = {
      tier: t,
      effectiveMin,
      effectiveRateT1: rates.t1,
      effectiveRateT0: rates.t0,
    };
  }
  return best;
}

/**
 * Compute the reward amount (₹, rounded) for ONE leg of a resolved tier.
 *   - CASHBACK_ON_MDR    → base = that leg's mdrPaid
 *   - CASHBACK_ON_VOLUME → base = that leg's gross volume
 *   - FLAT               → flat ₹ (handled at the split level, not here)
 */
function computeLegReward(
  scheme: Pick<IncentiveScheme, "rewardType">,
  resolved: ResolvedTier,
  leg: IncentiveLeg,
  legVol: RailVolume
): Money {
  const rate = leg === "INSTANT" ? resolved.effectiveRateT0 : resolved.effectiveRateT1;
  const base = scheme.rewardType === "CASHBACK_ON_MDR" ? legVol.mdrPaid : legVol.volume;
  return round(mul(base, rate));
}

/** Per-leg reward split. */
export type RewardSplit = { instant: Money; t1: Money };

/**
 * Compute the INDEPENDENT reward for each settlement leg. PERCENT rewards apply
 * each leg's own rate to that leg's own base. A FLAT reward is a single
 * milestone payout (base-independent), so it is attributed once — to the leg
 * that carried the larger volume (ties → T1) — and the other leg gets ₹0.
 */
export function computeRewardSplit(
  scheme: Pick<IncentiveScheme, "rewardType">,
  resolved: ResolvedTier,
  vol: SplitVolume
): RewardSplit {
  const isFlat = scheme.rewardType === "FLAT" || resolved.tier.rewardType === "FLAT";
  if (isFlat) {
    const flat = round(resolved.effectiveRateT1);
    return gt(vol.instant.volume, vol.t1.volume)
      ? { instant: flat, t1: dec(0) }
      : { instant: dec(0), t1: flat };
  }
  return {
    instant: computeLegReward(scheme, resolved, "INSTANT", vol.instant),
    t1: computeLegReward(scheme, resolved, "T1", vol.t1),
  };
}

// ---------------------------------------------------------------------------
// Month-end run
// ---------------------------------------------------------------------------

/** Per-leg run tally. */
export type LegTally = {
  paid: number;
  skipped: number;
  failed: number;
  rewarded: number;
};

const emptyLegTally = (): LegTally => ({ paid: 0, skipped: 0, failed: 0, rewarded: 0 });

export type IncentiveRunResult = {
  skippedRun: boolean;
  periodKey: string;
  schemes: number;
  users: number;
  // Sums across both legs (each leg is a separate payout record).
  paid: number;
  skipped: number;
  failed: number;
  totalRewarded: number;
  // Per-leg breakdown for one-at-a-time reporting.
  legs: { instant: LegTally; t1: LegTally };
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
    legs: { instant: emptyLegTally(), t1: emptyLegTally() },
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

  const tallyOf = (leg: IncentiveLeg) => (leg === "INSTANT" ? result.legs.instant : result.legs.t1);

  for (const scheme of schemes) {
    result.schemes++;
    for (const config of scheme.configs) {
      // Skip deleted / non-active accounts entirely.
      if (config.user.deletedAt || config.user.status !== "ACTIVE") continue;
      result.users++;

      const vol = await measureRailVolume(config.userId, scheme.rail, start, end);
      const resolved = resolveTier(scheme.tiers, config, vol.total.volume);
      const rewards = resolved ? computeRewardSplit(scheme, resolved, vol) : null;

      for (const leg of LEGS) {
        const legVol = leg === "INSTANT" ? vol.instant : vol.t1;
        const tally = tallyOf(leg);
        const reward = rewards ? (leg === "INSTANT" ? rewards.instant : rewards.t1) : dec(0);

        // No tier reached, or this leg's reward is below the payout floor → SKIPPED.
        if (!resolved || !gt(reward, 0) || !gte(reward, minReward)) {
          result.skipped++;
          tally.skipped++;
          if (!opts.dryRun) {
            const detail = !resolved
              ? "No reward tier reached this month"
              : `Reward ₹${toNumber(reward)} below the ₹${toNumber(minReward)} minimum`;
            await upsertPayout(scheme.id, config.userId, periodKey, leg, scheme.rail, {
              tierId: resolved?.tier.id ?? null,
              measuredVolume: legVol.volume,
              mdrPaid: legVol.mdrPaid,
              rewardAmount: reward,
              status: "SKIPPED",
              detail,
            });
          }
          continue;
        }

        if (opts.dryRun) {
          result.paid++;
          result.totalRewarded += toNumber(reward);
          tally.paid++;
          tally.rewarded += toNumber(reward);
          continue;
        }

        // Skip if already paid this leg (defensive — the credit is idempotent too).
        const existing = await prisma.incentivePayout.findUnique({
          where: {
            userId_schemeId_periodKey_leg: {
              userId: config.userId,
              schemeId: scheme.id,
              periodKey,
              leg,
            },
          },
        });
        if (existing && existing.status === "PAID") {
          result.paid++;
          result.totalRewarded += toNumber(existing.rewardAmount);
          tally.paid++;
          tally.rewarded += toNumber(existing.rewardAmount);
          continue;
        }

        try {
          const txn = await creditWallet({
            userId: config.userId,
            amount: reward,
            reason: "INCENTIVE",
            refType: "IncentivePayout",
            refId: `${scheme.id}:${periodKey}:${leg}`,
            note: rewardNote(scheme, resolved, leg, legVol, periodKey),
            idempotencyKey: `incentive:${config.userId}:${scheme.id}:${periodKey}:${leg}`,
          });
          await upsertPayout(scheme.id, config.userId, periodKey, leg, scheme.rail, {
            tierId: resolved.tier.id,
            measuredVolume: legVol.volume,
            mdrPaid: legVol.mdrPaid,
            rewardAmount: reward,
            status: "PAID",
            walletTxnId: txn.id,
            detail: null,
          });
          result.paid++;
          result.totalRewarded += toNumber(reward);
          tally.paid++;
          tally.rewarded += toNumber(reward);
        } catch (e) {
          const detail =
            e instanceof LedgerError ? e.code : e instanceof Error ? e.message : "ledger error";
          await upsertPayout(scheme.id, config.userId, periodKey, leg, scheme.rail, {
            tierId: resolved.tier.id,
            measuredVolume: legVol.volume,
            mdrPaid: legVol.mdrPaid,
            rewardAmount: reward,
            status: "FAILED",
            detail,
          });
          result.failed++;
          tally.failed++;
        }
      }
    }
  }

  return result;
}

const LEG_LABEL: Record<IncentiveLeg, string> = { INSTANT: "Instant (T+0)", T1: "T+1" };

function rewardNote(
  scheme: Pick<IncentiveScheme, "name" | "rewardType" | "rail">,
  resolved: ResolvedTier,
  leg: IncentiveLeg,
  legVol: RailVolume,
  periodKey: string
): string {
  const tierLabel = resolved.tier.label ? ` (${resolved.tier.label})` : "";
  const base =
    scheme.rewardType === "CASHBACK_ON_MDR"
      ? `MDR ₹${toNumber(legVol.mdrPaid)}`
      : `volume ₹${toNumber(legVol.volume)}`;
  return `${scheme.name}${tierLabel} · ${scheme.rail} ${LEG_LABEL[leg]} ${periodKey} reward on ${base}`;
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
  leg: IncentiveLeg,
  rail: IncentiveScheme["rail"],
  data: PayoutData
): Promise<void> {
  await prisma.incentivePayout.upsert({
    where: { userId_schemeId_periodKey_leg: { userId, schemeId, periodKey, leg } },
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
      leg,
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

/** One settlement leg's live progress figures. */
export type LegProgress = {
  volume: number;
  mdrPaid: number;
  /** Effective reward rate for this leg (fraction or ₹). */
  rate: number;
  /** Reward earned so far on this leg if the month closed now (₹). */
  projectedReward: number;
};

export type IncentiveProgress = {
  schemeId: string;
  schemeName: string;
  description: string | null;
  rail: IncentiveScheme["rail"];
  rewardType: IncentiveScheme["rewardType"];
  periodKey: string;
  /** Totals across both legs (the "Both" view). */
  volume: number;
  mdrPaid: number;
  /** Tier currently reached (null if below the lowest threshold). */
  currentTier: {
    id: string;
    label: string | null;
    /** T+1 (standard) rate. */
    rate: number;
    /** T+0 (instant) rate. */
    rateT0: number;
    rewardType: string;
  } | null;
  /** Reward earned so far this month across both legs if it closed now (₹). */
  projectedReward: number;
  /** Entry threshold of the lowest tier for this user (₹). */
  entryThreshold: number;
  /** Next tier to chase, if any. */
  nextTier: {
    id: string;
    label: string | null;
    threshold: number;
    remaining: number;
    rate: number;
    rateT0: number;
  } | null;
  /** Progress toward the next milestone (0..1). */
  progress: number;
  achieved: boolean;
  /** Per-leg breakdown for the Instant / T+1 / Both toggle. */
  legs: { instant: LegProgress; t1: LegProgress };
};

/**
 * Live current-month progress across every incentive scheme a user is assigned
 * to. Powers the retailer Rewards page (gamified tier progress, per-leg split).
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
    const totalVolume = vol.total.volume;
    const resolved = resolveTier(scheme.tiers, config, totalVolume);
    const rewards = resolved ? computeRewardSplit(scheme, resolved, vol) : null;

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
    const next = activeTiers.find((t) => gt(effMin(t), totalVolume)) ?? null;

    const instantReward = rewards ? toNumber(rewards.instant) : 0;
    const t1Reward = rewards ? toNumber(rewards.t1) : 0;

    // Progress: toward the next milestone, or full if the top tier is reached.
    let progress = 1;
    if (next) {
      const target = toNumber(effMin(next));
      progress = target > 0 ? Math.min(1, toNumber(totalVolume) / target) : 0;
    } else if (!resolved) {
      progress = entryThreshold > 0 ? Math.min(1, toNumber(totalVolume) / entryThreshold) : 0;
    }

    const nextRates = next ? effectiveRatesFor(next, config) : null;

    out.push({
      schemeId: scheme.id,
      schemeName: scheme.name,
      description: scheme.description,
      rail: scheme.rail,
      rewardType: scheme.rewardType,
      periodKey,
      volume: toNumber(totalVolume),
      mdrPaid: toNumber(vol.total.mdrPaid),
      currentTier: resolved
        ? {
            id: resolved.tier.id,
            label: resolved.tier.label,
            rate: toNumber(resolved.effectiveRateT1),
            rateT0: toNumber(resolved.effectiveRateT0),
            rewardType: resolved.tier.rewardType,
          }
        : null,
      projectedReward: instantReward + t1Reward,
      entryThreshold,
      nextTier:
        next && nextRates
          ? {
              id: next.id,
              label: next.label,
              threshold: toNumber(effMin(next)),
              remaining: Math.max(0, toNumber(effMin(next)) - toNumber(totalVolume)),
              rate: toNumber(nextRates.t1),
              rateT0: toNumber(nextRates.t0),
            }
          : null,
      progress,
      achieved: !!resolved && !next,
      legs: {
        instant: {
          volume: toNumber(vol.instant.volume),
          mdrPaid: toNumber(vol.instant.mdrPaid),
          rate: resolved ? toNumber(resolved.effectiveRateT0) : 0,
          projectedReward: instantReward,
        },
        t1: {
          volume: toNumber(vol.t1.volume),
          mdrPaid: toNumber(vol.t1.mdrPaid),
          rate: resolved ? toNumber(resolved.effectiveRateT1) : 0,
          projectedReward: t1Reward,
        },
      },
    });
  }
  return out;
}
