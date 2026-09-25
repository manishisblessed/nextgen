import type { IncentiveScheme, IncentiveTier, IncentivePayout } from "@prisma/client";

type SchemeWithRelations = IncentiveScheme & {
  tiers?: IncentiveTier[];
  _count?: { configs?: number; tiers?: number };
};

/** JSON-safe shape for an IncentiveTier (Decimals -> numbers). */
export function serializeTier(t: IncentiveTier) {
  return {
    id: t.id,
    schemeId: t.schemeId,
    label: t.label,
    minAmount: Number(t.minAmount),
    maxAmount: Number(t.maxAmount),
    rewardType: t.rewardType,
    rewardValue: Number(t.rewardValue),
    // Instant (T+0) rate; 0 means "same as rewardValue" (T+1) at reward time.
    rewardValueT0: Number(t.rewardValueT0),
    active: t.active,
  };
}

/** JSON-safe shape for an IncentiveScheme, optionally embedding tiers + counts. */
export function serializeIncentiveScheme(s: SchemeWithRelations) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    rail: s.rail,
    rewardType: s.rewardType,
    volumeBasis: s.volumeBasis,
    active: s.active,
    tierCount: s._count?.tiers ?? (s.tiers ? s.tiers.length : 0),
    userCount: s._count?.configs ?? 0,
    tiers: s.tiers
      ? [...s.tiers]
          .sort((a, b) => Number(a.minAmount) - Number(b.minAmount))
          .map(serializeTier)
      : undefined,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** JSON-safe shape for an IncentivePayout. */
export function serializePayout(p: IncentivePayout) {
  return {
    id: p.id,
    userId: p.userId,
    schemeId: p.schemeId,
    tierId: p.tierId,
    periodKey: p.periodKey,
    leg: p.leg,
    rail: p.rail,
    measuredVolume: Number(p.measuredVolume),
    mdrPaid: Number(p.mdrPaid),
    rewardAmount: Number(p.rewardAmount),
    status: p.status,
    detail: p.detail,
    createdAt: p.createdAt.toISOString(),
  };
}
