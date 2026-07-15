import { prisma } from "@/lib/db";
import { dec, gte, lte } from "@/lib/money";

/**
 * Derived schemes (cascade model).
 *
 * A network parent (SD/MD/DT) derives schemes from the scheme assigned to
 * them and assigns those to direct children. Derived slabs copy the parent
 * slab's band + rate types verbatim; only the values may change, bounded by:
 *
 *   charge     >= parent's charge      (the parent's charge margin)
 *   commission <= parent's commission  (the parent's commission margin)
 *
 * MDR mirror:  mdr >= parent's mdr.
 *
 * Those bounds are what make transaction-time margins (chain differences)
 * always non-negative for every tier.
 */

export class DerivedSchemeError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DerivedSchemeError";
    this.statusCode = statusCode;
  }
}

export const DERIVING_ROLES = ["SUPER_DISTRIBUTOR", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"] as const;

type SlabOverride = {
  parentSlabId: string;
  chargeValue?: number;
  commissionValue?: number;
};

type MdrSlabOverride = {
  parentSlabId: string;
  mdrValue?: number;
  mdrValueT0?: number;
};

/** Load the caller's own active scheme (the derivation base) or throw. */
async function ownBaseScheme(ownerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { role: true, schemeId: true },
  });
  if (!user) throw new DerivedSchemeError("User not found", 404);
  if (!DERIVING_ROLES.includes(user.role as (typeof DERIVING_ROLES)[number]))
    throw new DerivedSchemeError("Only SD/MD/DT can create schemes for their network", 403);
  if (!user.schemeId)
    throw new DerivedSchemeError(
      "You have no scheme assigned yet — ask your parent (or admin) to assign one before creating schemes",
      409
    );
  const base = await prisma.scheme.findFirst({
    where: { id: user.schemeId, active: true },
    include: { slabs: { where: { active: true }, orderBy: [{ service: "asc" }, { minAmount: "asc" }] } },
  });
  if (!base)
    throw new DerivedSchemeError("Your assigned scheme is inactive — contact your parent or admin", 409);
  return base;
}

async function ownBaseMdrScheme(ownerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { role: true, mdrSchemeId: true },
  });
  if (!user) throw new DerivedSchemeError("User not found", 404);
  if (!DERIVING_ROLES.includes(user.role as (typeof DERIVING_ROLES)[number]))
    throw new DerivedSchemeError("Only SD/MD/DT can create MDR schemes for their network", 403);
  if (!user.mdrSchemeId)
    throw new DerivedSchemeError(
      "You have no MDR scheme assigned yet — ask your parent (or admin) to assign one first",
      409
    );
  const base = await prisma.mdrScheme.findFirst({
    where: { id: user.mdrSchemeId, active: true },
    include: { slabs: { where: { active: true }, orderBy: [{ serviceKind: "asc" }, { minAmount: "asc" }] } },
  });
  if (!base)
    throw new DerivedSchemeError("Your assigned MDR scheme is inactive — contact your parent or admin", 409);
  return base;
}

/**
 * Create a scheme derived from the owner's own scheme. Every active slab of
 * the base is copied (band + types locked); `overrides` adjust charge /
 * commission values per slab within the parent bounds.
 */
export async function createDerivedScheme(input: {
  ownerId: string;
  name: string;
  description?: string | null;
  overrides?: SlabOverride[];
}) {
  const base = await ownBaseScheme(input.ownerId);
  if (base.slabs.length === 0)
    throw new DerivedSchemeError("Your scheme has no active slabs to derive from", 409);

  const byParent = new Map((input.overrides ?? []).map((o) => [o.parentSlabId, o]));
  for (const key of byParent.keys()) {
    if (!base.slabs.some((s) => s.id === key))
      throw new DerivedSchemeError(`Slab ${key} does not belong to your scheme`);
  }

  const slabData = base.slabs.map((s) => {
    const o = byParent.get(s.id);
    const chargeValue = o?.chargeValue ?? Number(s.chargeValue);
    const commissionValue = o?.commissionValue ?? Number(s.commissionValue);
    if (!gte(chargeValue, s.chargeValue))
      throw new DerivedSchemeError(
        `Charge for ${s.service} ₹${s.minAmount}–₹${s.maxAmount} must be >= your rate (${Number(s.chargeValue)})`
      );
    if (!lte(commissionValue, s.commissionValue))
      throw new DerivedSchemeError(
        `Commission for ${s.service} ₹${s.minAmount}–₹${s.maxAmount} must be <= your rate (${Number(s.commissionValue)})`
      );
    return {
      service: s.service,
      provider: s.provider,
      minAmount: s.minAmount,
      maxAmount: s.maxAmount,
      chargeType: s.chargeType,
      chargeValue: dec(chargeValue),
      commissionType: s.commissionType,
      commissionValue: dec(commissionValue),
      parentSlabId: s.id,
      active: true,
    };
  });

  try {
    return await prisma.scheme.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        active: true,
        ownerId: input.ownerId,
        parentSchemeId: base.id,
        slabs: { create: slabData },
      },
      include: { slabs: true, _count: { select: { slabs: true, users: true } } },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new DerivedSchemeError("A scheme with this name already exists — pick another name");
    throw e;
  }
}

/**
 * Update a derived scheme the caller owns: name/description/active and slab
 * values (revalidated against the linked parent slabs).
 */
export async function updateDerivedScheme(
  ownerId: string,
  schemeId: string,
  input: {
    name?: string;
    description?: string | null;
    active?: boolean;
    slabs?: Array<{ id: string; chargeValue?: number; commissionValue?: number }>;
  }
) {
  const scheme = await prisma.scheme.findFirst({
    where: { id: schemeId, ownerId },
    include: { slabs: true },
  });
  if (!scheme) throw new DerivedSchemeError("Scheme not found in your network", 404);

  const parentSlabs = scheme.parentSchemeId
    ? await prisma.schemeSlab.findMany({ where: { schemeId: scheme.parentSchemeId } })
    : [];
  const parentById = new Map(parentSlabs.map((s) => [s.id, s]));

  for (const edit of input.slabs ?? []) {
    const slab = scheme.slabs.find((s) => s.id === edit.id);
    if (!slab) throw new DerivedSchemeError(`Slab ${edit.id} does not belong to this scheme`);
    const parent = slab.parentSlabId ? parentById.get(slab.parentSlabId) : undefined;

    const chargeValue = edit.chargeValue ?? Number(slab.chargeValue);
    const commissionValue = edit.commissionValue ?? Number(slab.commissionValue);
    if (parent) {
      if (!gte(chargeValue, parent.chargeValue))
        throw new DerivedSchemeError(
          `Charge for ${slab.service} ₹${slab.minAmount}–₹${slab.maxAmount} must be >= your rate (${Number(parent.chargeValue)})`
        );
      if (!lte(commissionValue, parent.commissionValue))
        throw new DerivedSchemeError(
          `Commission for ${slab.service} ₹${slab.minAmount}–₹${slab.maxAmount} must be <= your rate (${Number(parent.commissionValue)})`
        );
    }
    await prisma.schemeSlab.update({
      where: { id: slab.id },
      data: { chargeValue: dec(chargeValue), commissionValue: dec(commissionValue) },
    });
  }

  try {
    return await prisma.scheme.update({
      where: { id: scheme.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { slabs: true, _count: { select: { slabs: true, users: true } } },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new DerivedSchemeError("A scheme with this name already exists — pick another name");
    throw e;
  }
}

/** Deactivate a derived scheme (blocked while any user is still assigned). */
export async function deactivateDerivedScheme(ownerId: string, schemeId: string) {
  const scheme = await prisma.scheme.findFirst({
    where: { id: schemeId, ownerId },
    include: { _count: { select: { users: true } } },
  });
  if (!scheme) throw new DerivedSchemeError("Scheme not found in your network", 404);
  if (scheme._count.users > 0)
    throw new DerivedSchemeError(
      `Cannot deactivate — ${scheme._count.users} user(s) still assigned to this scheme`,
      409
    );
  return prisma.scheme.update({ where: { id: scheme.id }, data: { active: false } });
}

// ---------------------------------------------------------------------------
// MDR mirror
// ---------------------------------------------------------------------------

export async function createDerivedMdrScheme(input: {
  ownerId: string;
  name: string;
  description?: string | null;
  overrides?: MdrSlabOverride[];
}) {
  const base = await ownBaseMdrScheme(input.ownerId);
  if (base.slabs.length === 0)
    throw new DerivedSchemeError("Your MDR scheme has no active slabs to derive from", 409);

  const byParent = new Map((input.overrides ?? []).map((o) => [o.parentSlabId, o]));
  for (const key of byParent.keys()) {
    if (!base.slabs.some((s) => s.id === key))
      throw new DerivedSchemeError(`Slab ${key} does not belong to your MDR scheme`);
  }

  const slabData = base.slabs.map((s) => {
    const o = byParent.get(s.id);
    const mdrValue = o?.mdrValue ?? Number(s.mdrValue);
    const mdrValueT0 = o?.mdrValueT0 ?? Number(s.mdrValueT0);
    if (!gte(mdrValue, s.mdrValue))
      throw new DerivedSchemeError(
        `MDR for ${s.serviceKind}/${s.paymentMode} ₹${s.minAmount}–₹${s.maxAmount} must be >= your rate (${Number(s.mdrValue)})`
      );
    if (!gte(mdrValueT0, s.mdrValueT0))
      throw new DerivedSchemeError(
        `T+0 MDR for ${s.serviceKind}/${s.paymentMode} ₹${s.minAmount}–₹${s.maxAmount} must be >= your rate (${Number(s.mdrValueT0)})`
      );
    return {
      serviceKind: s.serviceKind,
      paymentMode: s.paymentMode,
      company: s.company,
      cardType: s.cardType,
      brandType: s.brandType,
      classification: s.classification,
      minAmount: s.minAmount,
      maxAmount: s.maxAmount,
      mdrType: s.mdrType,
      mdrValue: dec(mdrValue),
      mdrValueT0: dec(mdrValueT0),
      commissionType: s.commissionType,
      parentSlabId: s.id,
      active: true,
    };
  });

  try {
    return await prisma.mdrScheme.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        active: true,
        ownerId: input.ownerId,
        parentSchemeId: base.id,
        slabs: { create: slabData },
      },
      include: { slabs: true, _count: { select: { slabs: true, users: true } } },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new DerivedSchemeError("An MDR scheme with this name already exists — pick another name");
    throw e;
  }
}

export async function updateDerivedMdrScheme(
  ownerId: string,
  schemeId: string,
  input: {
    name?: string;
    description?: string | null;
    active?: boolean;
    slabs?: Array<{ id: string; mdrValue?: number; mdrValueT0?: number }>;
  }
) {
  const scheme = await prisma.mdrScheme.findFirst({
    where: { id: schemeId, ownerId },
    include: { slabs: true },
  });
  if (!scheme) throw new DerivedSchemeError("MDR scheme not found in your network", 404);

  const parentSlabs = scheme.parentSchemeId
    ? await prisma.mdrSlab.findMany({ where: { schemeId: scheme.parentSchemeId } })
    : [];
  const parentById = new Map(parentSlabs.map((s) => [s.id, s]));

  for (const edit of input.slabs ?? []) {
    const slab = scheme.slabs.find((s) => s.id === edit.id);
    if (!slab) throw new DerivedSchemeError(`Slab ${edit.id} does not belong to this scheme`);
    const parent = slab.parentSlabId ? parentById.get(slab.parentSlabId) : undefined;

    const mdrValue = edit.mdrValue ?? Number(slab.mdrValue);
    const mdrValueT0 = edit.mdrValueT0 ?? Number(slab.mdrValueT0);
    if (parent && !gte(mdrValue, parent.mdrValue))
      throw new DerivedSchemeError(
        `MDR for ${slab.serviceKind}/${slab.paymentMode} ₹${slab.minAmount}–₹${slab.maxAmount} must be >= your rate (${Number(parent.mdrValue)})`
      );
    if (parent && !gte(mdrValueT0, parent.mdrValueT0))
      throw new DerivedSchemeError(
        `T+0 MDR for ${slab.serviceKind}/${slab.paymentMode} ₹${slab.minAmount}–₹${slab.maxAmount} must be >= your rate (${Number(parent.mdrValueT0)})`
      );
    await prisma.mdrSlab.update({
      where: { id: slab.id },
      data: { mdrValue: dec(mdrValue), mdrValueT0: dec(mdrValueT0) },
    });
  }

  try {
    return await prisma.mdrScheme.update({
      where: { id: scheme.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { slabs: true, _count: { select: { slabs: true, users: true } } },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new DerivedSchemeError("An MDR scheme with this name already exists — pick another name");
    throw e;
  }
}

export async function deactivateDerivedMdrScheme(ownerId: string, schemeId: string) {
  const scheme = await prisma.mdrScheme.findFirst({
    where: { id: schemeId, ownerId },
    include: { _count: { select: { users: true } } },
  });
  if (!scheme) throw new DerivedSchemeError("MDR scheme not found in your network", 404);
  if (scheme._count.users > 0)
    throw new DerivedSchemeError(
      `Cannot deactivate — ${scheme._count.users} user(s) still assigned to this MDR scheme`,
      409
    );
  return prisma.mdrScheme.update({ where: { id: scheme.id }, data: { active: false } });
}
