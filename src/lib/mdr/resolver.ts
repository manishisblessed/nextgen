import type { MdrServiceKind, MdrSlab, RateType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dec, gte, lte, mul, round, type Money } from "@/lib/money";

/**
 * MDR engine — resolves the merchant discount rate + commission share for
 * acquiring-style rails (POS / PG / QR / UPI). Cascade model: ONLY the user's
 * assigned active MdrScheme resolves — no platform-default fallback. Ancestor
 * margins come from resolveMdrChain (child MDR − own MDR per tier).
 *
 * Slab matching: (serviceKind, amount band) plus the card/acquirer dimensions
 * paymentMode, company, cardType, brandType, classification. A null/"*"
 * dimension on a slab is a wildcard; a slab pinned to a different value never
 * matches. Among eligible slabs the MOST SPECIFIC wins (most exact dimension
 * matches). mdrValue is the T+1 rate; mdrValueT0 (when set) applies to
 * instant/T+0 settlement.
 */

/** Transaction-side dimensions used to pick the best MDR slab. */
export type MdrDimensions = {
  paymentMode?: string | null;
  company?: string | null;
  cardType?: string | null;
  brandType?: string | null;
  classification?: string | null;
  /** T0 = instant settlement (uses mdrValueT0 when set); T1 = standard. */
  settlementType?: "T0" | "T1";
};

export type EffectiveMdr = {
  source: "USER_SCHEME" | "NONE";
  schemeId: string | null;
  schemeName: string | null;
  slabId: string | null;
  /** Absolute MDR (₹) charged for `amount`. Zero when no slab matched. */
  mdr: Money;
  mdrType: RateType | null;
  commission: {
    retailer: Money;
    distributor: Money;
    master: Money;
    superDistributor: Money;
  };
};

function applyRate(amount: Money | string | number, type: RateType, value: Money | string | number): Money {
  if (type === "FLAT") return round(value);
  return round(mul(amount, value)); // PERCENT stored as a fraction (0.0050 = 0.5%)
}

function emptyMdr(): EffectiveMdr {
  return {
    source: "NONE",
    schemeId: null,
    schemeName: null,
    slabId: null,
    mdr: dec(0),
    mdrType: null,
    commission: {
      retailer: dec(0),
      distributor: dec(0),
      master: dec(0),
      superDistributor: dec(0),
    },
  };
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();

/**
 * Score a slab against the transaction dimensions. Returns -1 when the slab
 * is ineligible (pinned to a different value), otherwise the number of exact
 * dimension matches (higher = more specific). A null/"*" slab dimension is a
 * wildcard: eligible, but scores 0 for that dimension.
 */
function slabScore(slab: MdrSlab, dims: MdrDimensions): number {
  let score = 0;
  const pairs: Array<[string | null, string | null | undefined]> = [
    [slab.paymentMode === "*" ? null : slab.paymentMode, dims.paymentMode === "*" ? null : dims.paymentMode],
    [slab.company, dims.company],
    [slab.cardType, dims.cardType],
    [slab.brandType, dims.brandType],
    [slab.classification, dims.classification],
  ];
  for (const [slabVal, txnVal] of pairs) {
    if (slabVal == null || slabVal === "") continue; // wildcard slab dimension
    if (!txnVal || norm(slabVal) !== norm(txnVal)) return -1; // pinned mismatch
    score++;
  }
  return score;
}

/** Pick the most specific eligible slab whose band contains `amount`. */
function pickSlab(slabs: MdrSlab[], amount: Money, dims: MdrDimensions): MdrSlab | null {
  const inBand = slabs.filter((s) => gte(amount, s.minAmount) && lte(amount, s.maxAmount));
  let best: MdrSlab | null = null;
  let bestScore = -1;
  for (const slab of inBand) {
    const score = slabScore(slab, dims);
    if (score > bestScore) {
      best = slab;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

/** Effective MDR value for a slab under a settlement type (T0 falls back to T1). */
function slabMdrValue(slab: MdrSlab, settlementType?: "T0" | "T1") {
  if (settlementType === "T0" && Number(slab.mdrValueT0) > 0) return slab.mdrValueT0;
  return slab.mdrValue;
}

async function resolveFromScheme(
  schemeId: string,
  serviceKind: MdrServiceKind,
  dims: MdrDimensions,
  amount: Money
): Promise<MdrSlab | null> {
  const slabs = await prisma.mdrSlab.findMany({
    where: { schemeId, serviceKind, active: true },
    orderBy: { minAmount: "asc" },
  });
  return pickSlab(slabs, amount, dims);
}

export async function getEffectiveMdr(
  userId: string,
  serviceKind: MdrServiceKind,
  amount: Money | string | number,
  dims: MdrDimensions | string = {}
): Promise<EffectiveMdr> {
  // Back-compat: a plain string argument is the payment mode.
  const d: MdrDimensions = typeof dims === "string" ? { paymentMode: dims } : dims;
  const amt = round(amount);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mdrSchemeId: true },
  });
  if (!user) return emptyMdr();

  const build = (
    slab: MdrSlab,
    schemeId: string,
    schemeName: string,
    source: EffectiveMdr["source"]
  ): EffectiveMdr => ({
    source,
    schemeId,
    schemeName,
    slabId: slab.id,
    mdr: applyRate(amt, slab.mdrType, slabMdrValue(slab, d.settlementType)),
    mdrType: slab.mdrType,
    commission: {
      retailer: applyRate(amt, slab.commissionType, slab.commissionRetailer),
      distributor: applyRate(amt, slab.commissionType, slab.commissionDistributor),
      master: applyRate(amt, slab.commissionType, slab.commissionMaster),
      superDistributor: applyRate(amt, slab.commissionType, slab.commissionSuperDistributor),
    },
  });

  if (user.mdrSchemeId) {
    const scheme = await prisma.mdrScheme.findFirst({
      where: { id: user.mdrSchemeId, active: true },
      select: { id: true, name: true },
    });
    if (scheme) {
      const slab = await resolveFromScheme(scheme.id, serviceKind, d, amt);
      if (slab) return build(slab, scheme.id, scheme.name, "USER_SCHEME");
    }
  }

  return emptyMdr();
}

// ---------------------------------------------------------------------------
// MDR pricing chain (cascade model)
// ---------------------------------------------------------------------------

export type MdrChainMember = {
  userId: string;
  role: string;
  /** 0 = transacting user (machine owner), 1..3 = ancestors. */
  level: number;
  schemeId: string | null;
  slabId: string | null;
  /** Absolute MDR (₹) this member's own scheme prices for the txn. */
  mdr: Money;
  /**
   * Gross commission (₹) this member earns: level 0 → 0 (the retailer's
   * benefit is the net credit); level>0 → max(0, childMdr − ownMdr).
   */
  gross: Money;
};

export type MdrChain =
  | {
      ok: true;
      schemeId: string;
      schemeName: string;
      slabId: string;
      /** MDR charged to the transacting user (their own scheme). */
      userMdr: Money;
      members: MdrChainMember[];
    }
  | { ok: false; reason: "NO_USER" | "NO_SCHEME" | "NO_SLAB" };

const NETWORK_ROLES = new Set([
  "RETAILER",
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
]);

/**
 * Resolve the MDR margin chain for a POS/PG/QR/UPI capture. Mirrors
 * resolvePricingChain: the transacting user needs an active MdrScheme with a
 * matching slab; ancestors without one earn zero (pass-through).
 */
export async function resolveMdrChain(
  userId: string,
  serviceKind: MdrServiceKind,
  amount: Money | string | number,
  dims: MdrDimensions | string = {}
): Promise<MdrChain> {
  const d: MdrDimensions = typeof dims === "string" ? { paymentMode: dims } : dims;
  const amt = round(amount);

  const walk: Array<{ id: string; role: string; mdrSchemeId: string | null }> = [];
  let currentId: string | null = userId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 4 && currentId; depth++) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const u: { id: string; role: string; mdrSchemeId: string | null; parentId: string | null; status: string } | null =
      await prisma.user.findUnique({
        where: { id: currentId },
        select: { id: true, role: true, mdrSchemeId: true, parentId: true, status: true },
      });
    if (!u || u.status === "CLOSED" || !NETWORK_ROLES.has(u.role)) break;
    walk.push({ id: u.id, role: u.role, mdrSchemeId: u.mdrSchemeId });
    currentId = u.parentId;
  }

  if (walk.length === 0) return { ok: false, reason: "NO_USER" };

  type Resolved = { schemeId: string | null; schemeName: string | null; slab: MdrSlab | null };
  const resolved: Resolved[] = [];
  for (const member of walk) {
    let r: Resolved = { schemeId: null, schemeName: null, slab: null };
    if (member.mdrSchemeId) {
      const scheme = await prisma.mdrScheme.findFirst({
        where: { id: member.mdrSchemeId, active: true },
        select: { id: true, name: true },
      });
      if (scheme) {
        r = {
          schemeId: scheme.id,
          schemeName: scheme.name,
          slab: await resolveFromScheme(scheme.id, serviceKind, d, amt),
        };
      }
    }
    resolved.push(r);
  }

  const self = resolved[0];
  if (!self.schemeId) return { ok: false, reason: "NO_SCHEME" };
  if (!self.slab) return { ok: false, reason: "NO_SLAB" };

  const members: MdrChainMember[] = [];
  let childMdr = applyRate(amt, self.slab.mdrType, slabMdrValue(self.slab, d.settlementType));

  members.push({
    userId: walk[0].id,
    role: walk[0].role,
    level: 0,
    schemeId: self.schemeId,
    slabId: self.slab.id,
    mdr: childMdr,
    gross: dec(0),
  });

  for (let i = 1; i < walk.length; i++) {
    const r = resolved[i];
    if (r.slab) {
      const ownMdr = applyRate(amt, r.slab.mdrType, slabMdrValue(r.slab, d.settlementType));
      const margin = childMdr.gt(ownMdr) ? round(childMdr.sub(ownMdr)) : dec(0);
      members.push({
        userId: walk[i].id,
        role: walk[i].role,
        level: i,
        schemeId: r.schemeId,
        slabId: r.slab.id,
        mdr: ownMdr,
        gross: margin,
      });
      childMdr = ownMdr;
    } else {
      members.push({
        userId: walk[i].id,
        role: walk[i].role,
        level: i,
        schemeId: r.schemeId,
        slabId: null,
        mdr: childMdr,
        gross: dec(0),
      });
    }
  }

  return {
    ok: true,
    schemeId: self.schemeId,
    schemeName: self.schemeName ?? "",
    slabId: self.slab.id,
    userMdr: members[0].mdr,
    members,
  };
}

/**
 * Validate a candidate slab band against existing active slabs with the SAME
 * dimension tuple (scheme, serviceKind, paymentMode, company, cardType,
 * brandType, classification). Different dimension values may legitimately
 * share bands. Returns an error string or null.
 */
export async function validateMdrSlab(
  schemeId: string,
  serviceKind: MdrServiceKind,
  paymentMode: string,
  range: { minAmount: number; maxAmount: number },
  excludeSlabId?: string,
  dims?: Pick<MdrDimensions, "company" | "cardType" | "brandType" | "classification">
): Promise<string | null> {
  const min = dec(range.minAmount);
  const max = dec(range.maxAmount);
  if (min.gt(max)) return "minAmount must be less than or equal to maxAmount";

  const existing = await prisma.mdrSlab.findMany({
    where: {
      schemeId,
      serviceKind,
      paymentMode,
      company: dims?.company ?? null,
      cardType: dims?.cardType ?? null,
      brandType: dims?.brandType ?? null,
      classification: dims?.classification ?? null,
      active: true,
      ...(excludeSlabId ? { id: { not: excludeSlabId } } : {}),
    },
    select: { minAmount: true, maxAmount: true },
  });
  for (const s of existing) {
    if (lte(min, s.maxAmount) && lte(dec(s.minAmount), max)) {
      return `Range ₹${min}–₹${max} overlaps an existing ${paymentMode} slab (₹${dec(s.minAmount)}–₹${dec(s.maxAmount)})`;
    }
  }
  return null;
}
