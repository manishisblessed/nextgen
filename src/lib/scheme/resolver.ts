import type { Prisma, RateType, ServiceCode, SchemeSlab } from "@prisma/client";
import { prisma } from "../db";
import { add, dec, gte, gt, lte, mul, round, type Money } from "../money";

/**
 * Scheme resolver — the single source of truth for "what does this user pay
 * (charge) and earn (commission) for a given service + amount?".
 *
 * Cascade model: ONLY the user's explicitly-assigned Scheme (User.schemeId,
 * active) resolves. There is no platform-default fallback — a user without an
 * assigned scheme is blocked from transacting (src/lib/scheme/gate.ts).
 * Within the scheme we pick the active SchemeSlab for `service` whose
 * [minAmount, maxAmount] band contains `amount`.
 *
 * `resolvePricingChain` extends this up the network: each ancestor's gross
 * commission = the margin between their child's scheme rate and their own
 * scheme rate for the same service + band.
 *
 * Provider dimension: a slab may target a specific partner route (e.g.
 * "BBPS_1" vs "BBPS_2"). When the caller passes the provider handling the
 * transaction, an exact provider slab beats the null (any-provider) slab for
 * the same band.
 *
 * All money math goes through money.ts Decimal helpers — never JS floats.
 *
 * A slab value is either a flat ₹ amount (RateType.FLAT) or a fraction of the
 * transaction amount (RateType.PERCENT, e.g. 0.0050 = 0.5%). `applyRate`
 * normalizes both into an absolute rupee figure for `amount`.
 */

export type ResolvedRateSource = "USER_SCHEME" | "NONE";

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
  /** Absolute commission (₹) for each level for `amount` (legacy columns). */
  commission: CommissionSplit;
  /** Commission for the resolving user's own role, picked from the split. */
  commissionForUser: Money;
  /**
   * Cascade model: absolute commission (₹) the assigned user earns on this
   * slab (SchemeSlab.commissionValue). This is what the transacting user is
   * credited; ancestor margins come from resolvePricingChain.
   */
  commissionOwn: Money;
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
    commissionOwn: dec(0),
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
    commissionOwn: applyRate(amount, slab.commissionType, slab.commissionValue),
  };
}

/**
 * Resolve the effective charge + commission for a user's service transaction.
 * ONLY the user's assigned active scheme resolves (no default fallback).
 * Returns a zeroed `NONE` result when the user has no scheme or the scheme has
 * no matching slab — the scheme gate blocks transactions in that state.
 */
export async function getEffectiveRate(
  userId: string,
  service: ServiceCode,
  amount: Money | string | number,
  provider?: string | null
): Promise<EffectiveRate> {
  const amt = round(amount);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, schemeId: true },
  });
  if (!user) return emptyRate("RETAILER");

  if (user.schemeId) {
    const scheme = await prisma.scheme.findFirst({
      where: { id: user.schemeId, active: true },
      select: { id: true, name: true },
    });
    if (scheme) {
      const slab = await findSlab(scheme.id, service, amt, provider);
      if (slab) return rateFromSlab(amt, slab, scheme.id, scheme.name, "USER_SCHEME", user.role);
    }
  }

  return emptyRate(user.role);
}

// ---------------------------------------------------------------------------
// Pricing chain (cascade model)
// ---------------------------------------------------------------------------

export type ChainMember = {
  userId: string;
  role: string;
  /** 0 = transacting user, 1 = parent, 2 = grandparent, 3 = great-grandparent */
  level: number;
  schemeId: string | null;
  slabId: string | null;
  /** Absolute charge (₹) this member's own scheme prices for the txn. */
  charge: Money;
  /** Absolute own-commission (₹) this member's scheme grants (commissionValue). */
  commission: Money;
  /**
   * Gross commission (₹) this member earns on the transaction:
   *   level 0 → their own commissionValue;
   *   level>0 → margin vs the child: max(0, childCharge − ownCharge)
   *             + max(0, ownCommission − childCommission).
   */
  gross: Money;
};

export type PricingChain =
  | {
      ok: true;
      schemeId: string;
      schemeName: string;
      slabId: string;
      /** What the transacting user pays as service charge. */
      userCharge: Money;
      chargeType: RateType;
      /** What the transacting user earns (own commissionValue). */
      userCommission: Money;
      members: ChainMember[];
    }
  | { ok: false; reason: "NO_USER" | "NO_SCHEME" | "NO_SLAB" };

const NETWORK_ROLES = new Set([
  "RETAILER",
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
]);

/**
 * Resolve the full network pricing chain for a transaction.
 *
 * The transacting user MUST have an active scheme with a matching slab (the
 * gate enforces this before money moves). Each ancestor's margin is computed
 * against the nearest descendant's effective rate; an ancestor with no
 * scheme/slab earns zero and passes the child's rate through unchanged, so a
 * hole in the chain can never inflate anyone else's margin.
 */
export async function resolvePricingChain(
  userId: string,
  service: ServiceCode,
  amount: Money | string | number,
  provider?: string | null
): Promise<PricingChain> {
  const amt = round(amount);

  // Walk self → parent → … (max 4 network tiers), skipping staff roles.
  const walk: Array<{ id: string; role: string; schemeId: string | null }> = [];
  let currentId: string | null = userId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 4 && currentId; depth++) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const u: { id: string; role: string; schemeId: string | null; parentId: string | null; status: string } | null =
      await prisma.user.findUnique({
        where: { id: currentId },
        select: { id: true, role: true, schemeId: true, parentId: true, status: true },
      });
    if (!u || u.status === "CLOSED" || !NETWORK_ROLES.has(u.role)) break;
    walk.push({ id: u.id, role: u.role, schemeId: u.schemeId });
    currentId = u.parentId;
  }

  if (walk.length === 0) return { ok: false, reason: "NO_USER" };

  // Resolve each member's own scheme slab for this service + amount.
  type Resolved = {
    schemeId: string | null;
    schemeName: string | null;
    slab: SchemeSlab | null;
  };
  const resolved: Resolved[] = [];
  for (const member of walk) {
    let r: Resolved = { schemeId: null, schemeName: null, slab: null };
    if (member.schemeId) {
      const scheme = await prisma.scheme.findFirst({
        where: { id: member.schemeId, active: true },
        select: { id: true, name: true },
      });
      if (scheme) {
        r = { schemeId: scheme.id, schemeName: scheme.name, slab: await findSlab(scheme.id, service, amt, provider) };
      }
    }
    resolved.push(r);
  }

  const self = resolved[0];
  if (!self.schemeId) return { ok: false, reason: "NO_SCHEME" };
  if (!self.slab) return { ok: false, reason: "NO_SLAB" };

  const members: ChainMember[] = [];
  // Effective child values carried up the chain (pass-through on holes).
  let childCharge = applyRate(amt, self.slab.chargeType, self.slab.chargeValue);
  let childCommission = applyRate(amt, self.slab.commissionType, self.slab.commissionValue);

  members.push({
    userId: walk[0].id,
    role: walk[0].role,
    level: 0,
    schemeId: self.schemeId,
    slabId: self.slab.id,
    charge: childCharge,
    commission: childCommission,
    gross: childCommission,
  });

  for (let i = 1; i < walk.length; i++) {
    const r = resolved[i];
    if (r.slab) {
      const ownCharge = applyRate(amt, r.slab.chargeType, r.slab.chargeValue);
      const ownCommission = applyRate(amt, r.slab.commissionType, r.slab.commissionValue);
      const chargeMargin = gt(childCharge, ownCharge) ? round(childCharge.sub(ownCharge)) : dec(0);
      const commissionMargin = gt(ownCommission, childCommission)
        ? round(ownCommission.sub(childCommission))
        : dec(0);
      members.push({
        userId: walk[i].id,
        role: walk[i].role,
        level: i,
        schemeId: r.schemeId,
        slabId: r.slab.id,
        charge: ownCharge,
        commission: ownCommission,
        gross: round(add(chargeMargin, commissionMargin)),
      });
      childCharge = ownCharge;
      childCommission = ownCommission;
    } else {
      // No scheme/slab for this ancestor — zero margin, pass child values up.
      members.push({
        userId: walk[i].id,
        role: walk[i].role,
        level: i,
        schemeId: r.schemeId,
        slabId: null,
        charge: childCharge,
        commission: childCommission,
        gross: dec(0),
      });
    }
  }

  return {
    ok: true,
    schemeId: self.schemeId,
    schemeName: self.schemeName ?? "",
    slabId: self.slab.id,
    userCharge: members[0].charge,
    chargeType: self.slab.chargeType,
    userCommission: members[0].commission,
    members,
  };
}

/**
 * Find the active slab in a scheme whose band contains `amount`. When a
 * provider is given, an exact provider slab wins over the null (any-provider)
 * slab; a slab pinned to a DIFFERENT provider never matches.
 */
async function findSlab(
  schemeId: string,
  service: ServiceCode,
  amount: Money,
  provider?: string | null
): Promise<SchemeSlab | null> {
  const slabs = await prisma.schemeSlab.findMany({
    where: { schemeId, service, active: true },
    orderBy: { minAmount: "asc" },
  });
  const inBand = slabs.filter((s) => gte(amount, s.minAmount) && lte(amount, s.maxAmount));
  if (provider) {
    const exact = inBand.find((s) => s.provider === provider);
    if (exact) return exact;
  }
  return inBand.find((s) => s.provider == null) ?? null;
}

export type SlabRange = { minAmount: Money | string | number; maxAmount: Money | string | number };

/**
 * Validate a candidate [min, max] band against the existing active slabs for a
 * scheme+service+provider. Slabs pinned to different providers may share bands
 * (that is the point of the provider dimension), so only slabs with the SAME
 * provider value (or both null) are compared. Returns an error string if the
 * band is invalid (min > max) or overlaps, otherwise null. `excludeSlabId`
 * lets an edit ignore its own row.
 */
export async function validateNonOverlapping(
  schemeId: string,
  service: ServiceCode,
  range: SlabRange,
  excludeSlabId?: string,
  provider?: string | null
): Promise<string | null> {
  const min = dec(range.minAmount);
  const max = dec(range.maxAmount);
  if (gt(min, max)) return "minAmount must be less than or equal to maxAmount";

  const existing = await prisma.schemeSlab.findMany({
    where: {
      schemeId,
      service,
      provider: provider ?? null,
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
