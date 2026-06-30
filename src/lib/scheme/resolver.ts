import type { Prisma, RateType, ServiceCode, SchemeSlab } from "@prisma/client";
import { prisma } from "../db";
import { add, dec, gte, gt, lte, mul, round, type Money } from "../money";

/**
 * Scheme resolver — the single source of truth for "what does this user pay
 * (charge) and earn (commission) for a given service + amount?".
 *
 * Resolution precedence (first hit wins):
 *   1. The user's explicitly-assigned Scheme (User.schemeId), if active.
 *   2. The platform default Scheme (Scheme.isDefault && active).
 * Within the chosen scheme we pick the active SchemeSlab for `service` whose
 * [minAmount, maxAmount] band contains `amount`.
 *
 * All money math goes through money.ts Decimal helpers — never JS floats.
 *
 * A slab value is either a flat ₹ amount (RateType.FLAT) or a fraction of the
 * transaction amount (RateType.PERCENT, e.g. 0.0050 = 0.5%). `applyRate`
 * normalizes both into an absolute rupee figure for `amount`.
 */

export type ResolvedRateSource = "USER_SCHEME" | "DEFAULT_SCHEME" | "NONE";

export type CommissionSplit = {
  retailer: Money;
  distributor: Money;
  master: Money;
  superDistributor: Money;
};

export type EffectiveRate = {
  source: ResolvedRateSource;
  schemeId: string | null;
  schemeName: string | null;
  slabId: string | null;
  /** Absolute customer-facing charge (₹) for `amount`. Zero when no slab. */
  charge: Money;
  chargeType: RateType | null;
  /** Absolute commission (₹) for each level for `amount`. */
  commission: CommissionSplit;
  /** Commission for the resolving user's own role, picked from the split. */
  commissionForUser: Money;
};

/** Map a payout mode to the ServiceCode used for scheme charge lookups. */
export const PAYOUT_MODE_SERVICE: Record<string, ServiceCode> = {
  IMPS: "DMT_IMPS",
  NEFT: "DMT_NEFT",
  RTGS: "DMT_RTGS",
  UPI: "UPI_PAYOUT",
};

/** Turn a FLAT/PERCENT slab value into an absolute rupee amount for `amount`. */
export function applyRate(
  amount: Money | string | number,
  type: RateType,
  value: Prisma.Decimal | string | number
): Money {
  if (type === "FLAT") return round(value);
  // PERCENT values are stored as a fraction (0.0050 = 0.5%).
  return round(mul(amount, value));
}

/** Pick the commission figure that belongs to a user's role. */
function commissionForRole(role: string, split: CommissionSplit): Money {
  switch (role) {
    case "RETAILER":
      return split.retailer;
    case "DISTRIBUTOR":
      return split.distributor;
    case "MASTER_DISTRIBUTOR":
      return split.master;
    case "SUPER_DISTRIBUTOR":
      return split.superDistributor;
    default:
      return dec(0);
  }
}

const ZERO_SPLIT = (): CommissionSplit => ({
  retailer: dec(0),
  distributor: dec(0),
  master: dec(0),
  superDistributor: dec(0),
});

function emptyRate(role: string): EffectiveRate {
  return {
    source: "NONE",
    schemeId: null,
    schemeName: null,
    slabId: null,
    charge: dec(0),
    chargeType: null,
    commission: ZERO_SPLIT(),
    commissionForUser: dec(0),
  };
}

/** Compute the full resolved rate for a chosen slab. */
function rateFromSlab(
  amount: Money | string | number,
  slab: SchemeSlab,
  schemeId: string,
  schemeName: string,
  source: ResolvedRateSource,
  role: string
): EffectiveRate {
  const charge = applyRate(amount, slab.chargeType, slab.chargeValue);
  const commission: CommissionSplit = {
    retailer: applyRate(amount, slab.commissionType, slab.commissionRetailer),
    distributor: applyRate(amount, slab.commissionType, slab.commissionDistributor),
    master: applyRate(amount, slab.commissionType, slab.commissionMaster),
    superDistributor: applyRate(amount, slab.commissionType, (slab as any).commissionSuperDistributor ?? 0),
  };
  return {
    source,
    schemeId,
    schemeName,
    slabId: slab.id,
    charge,
    chargeType: slab.chargeType,
    commission,
    commissionForUser: commissionForRole(role, commission),
  };
}

/**
 * Resolve the effective charge + commission for a user's service transaction.
 * Returns a zeroed `NONE` result if neither the user's scheme nor a default
 * scheme has a matching slab — callers may then fall back to legacy pricing.
 */
export async function getEffectiveRate(
  userId: string,
  service: ServiceCode,
  amount: Money | string | number
): Promise<EffectiveRate> {
  const amt = round(amount);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, schemeId: true },
  });
  if (!user) return emptyRate("RETAILER");

  // 1. The user's assigned scheme (only if active).
  if (user.schemeId) {
    const scheme = await prisma.scheme.findFirst({
      where: { id: user.schemeId, active: true },
      select: { id: true, name: true },
    });
    if (scheme) {
      const slab = await findSlab(scheme.id, service, amt);
      if (slab) return rateFromSlab(amt, slab, scheme.id, scheme.name, "USER_SCHEME", user.role);
    }
  }

  // 2. The platform default scheme.
  const def = await prisma.scheme.findFirst({
    where: { isDefault: true, active: true },
    select: { id: true, name: true },
  });
  if (def) {
    const slab = await findSlab(def.id, service, amt);
    if (slab) return rateFromSlab(amt, slab, def.id, def.name, "DEFAULT_SCHEME", user.role);
  }

  return emptyRate(user.role);
}

/** Find the active slab in a scheme whose band contains `amount`. */
async function findSlab(
  schemeId: string,
  service: ServiceCode,
  amount: Money
): Promise<SchemeSlab | null> {
  const slabs = await prisma.schemeSlab.findMany({
    where: { schemeId, service, active: true },
    orderBy: { minAmount: "asc" },
  });
  for (const slab of slabs) {
    if (gte(amount, slab.minAmount) && lte(amount, slab.maxAmount)) return slab;
  }
  return null;
}

export type SlabRange = { minAmount: Money | string | number; maxAmount: Money | string | number };

/**
 * Validate a candidate [min, max] band against the existing active slabs for a
 * scheme+service. Returns an error string if the band is invalid (min > max) or
 * overlaps another active slab, otherwise null. `excludeSlabId` lets an edit
 * ignore its own row.
 */
export async function validateNonOverlapping(
  schemeId: string,
  service: ServiceCode,
  range: SlabRange,
  excludeSlabId?: string
): Promise<string | null> {
  const min = dec(range.minAmount);
  const max = dec(range.maxAmount);
  if (gt(min, max)) return "minAmount must be less than or equal to maxAmount";

  const existing = await prisma.schemeSlab.findMany({
    where: {
      schemeId,
      service,
      active: true,
      ...(excludeSlabId ? { id: { not: excludeSlabId } } : {}),
    },
    select: { id: true, minAmount: true, maxAmount: true },
  });

  // Two closed ranges [a,b] and [c,d] overlap iff a <= d AND c <= b.
  for (const s of existing) {
    if (lte(min, s.maxAmount) && lte(dec(s.minAmount), max)) {
      return `Range ₹${min.toString()}–₹${max.toString()} overlaps an existing slab (₹${dec(
        s.minAmount
      ).toString()}–₹${dec(s.maxAmount).toString()})`;
    }
  }
  return null;
}

/** Combined service charge + GST helper, mirroring the payout breakdown shape. */
export function withGst(charge: Money, gstPercent: number): { gst: Money; total: Money } {
  const gst = round(mul(charge, dec(gstPercent).div(100)));
  return { gst, total: round(add(charge, gst)) };
}
