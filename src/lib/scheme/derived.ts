import { prisma } from "@/lib/db";
import { dec, gte, lte } from "@/lib/money";
import { isChargeDrivenService, schemeAssignerLabel } from "@/lib/scheme/constants";

/**
 * Derived schemes (cascade model).
 *
 * A network parent (SD/MD/DT) derives schemes from the scheme assigned to
 * them and assigns those to direct children. Derived slabs copy the parent
 * slab's band + rate types verbatim; only the values may change, bounded by:
 *
 *   charge     >= parent's charge
 *   commission <= charge_markup + parent's commission
 *     (where charge_markup = child charge - parent charge)
 *
 * This allows the parent to fund child commission from their charge markup,
 * while ensuring the parent's net margin stays non-negative.
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

/**
 * Load the caller's own active scheme (the derivation base) or throw. Includes
 * both the service slabs and the MDR (POS/PG/QR/UPI) slabs — one unified scheme.
 */
async function ownBaseScheme(ownerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { role: true, schemeId: true },
  });
  if (!user) throw new DerivedSchemeError("User not found", 404);
  if (!DERIVING_ROLES.includes(user.role as (typeof DERIVING_ROLES)[number]))
    throw new DerivedSchemeError("Only SD/MD/DT can create schemes for their network", 403);
  const assigner = schemeAssignerLabel(user.role);
  if (!user.schemeId)
    throw new DerivedSchemeError(
      `You have no scheme assigned yet — ask your ${assigner} to assign one before creating schemes`,
      409
    );
  const base = await prisma.scheme.findFirst({
    where: { id: user.schemeId, active: true },
    include: {
      slabs: { where: { active: true }, orderBy: [{ service: "asc" }, { minAmount: "asc" }] },
      mdrSlabs: { where: { active: true }, orderBy: [{ serviceKind: "asc" }, { minAmount: "asc" }] },
    },
  });
  if (!base)
    throw new DerivedSchemeError(`Your assigned scheme is inactive — contact your ${assigner}`, 409);
  return base;
}

/**
 * Create a scheme derived from the owner's own scheme. Every active slab of the
 * base — service AND MDR — is copied (band + types locked); `overrides` adjust
 * charge/commission and `mdrOverrides` adjust MDR values, each within bounds.
 */
export async function createDerivedScheme(input: {
  ownerId: string;
  name: string;
  description?: string | null;
  overrides?: SlabOverride[];
  mdrOverrides?: MdrSlabOverride[];
}) {
  const base = await ownBaseScheme(input.ownerId);
  if (base.slabs.length === 0 && base.mdrSlabs.length === 0)
    throw new DerivedSchemeError("Your scheme has no active slabs to derive from", 409);

  const byParent = new Map((input.overrides ?? []).map((o) => [o.parentSlabId, o]));
  for (const key of byParent.keys()) {
    if (!base.slabs.some((s) => s.id === key))
      throw new DerivedSchemeError(`Slab ${key} does not belong to your scheme`);
  }
  const byMdrParent = new Map((input.mdrOverrides ?? []).map((o) => [o.parentSlabId, o]));
  for (const key of byMdrParent.keys()) {
    if (!base.mdrSlabs.some((s) => s.id === key))
      throw new DerivedSchemeError(`MDR slab ${key} does not belong to your scheme`);
  }

  const slabData = base.slabs.map((s) => {
    const o = byParent.get(s.id);
    const chargeValue = o?.chargeValue ?? Number(s.chargeValue);
    const commissionValue = o?.commissionValue ?? Number(s.commissionValue);
    if (!gte(chargeValue, s.chargeValue))
      throw new DerivedSchemeError(
        `Charge for ${s.service} ₹${s.minAmount}–₹${s.maxAmount} must be >= your rate (${Number(s.chargeValue)})`
      );
    const chargeMarkup = chargeValue - Number(s.chargeValue);
    // BBPS/Payout: the child's commission is funded from the charge markup, so
    // it can be at most the markup. Pool services also add the parent commission.
    const chargeDriven = isChargeDrivenService(s.service);
    const maxCommission = chargeDriven ? chargeMarkup : chargeMarkup + Number(s.commissionValue);
    if (commissionValue < 0 || commissionValue > maxCommission + 1e-9)
      throw new DerivedSchemeError(
        `Commission for ${s.service} ₹${s.minAmount}–₹${s.maxAmount} must be between 0 and ${parseFloat(maxCommission.toFixed(4))} (${chargeDriven ? "your charge markup" : "your commission + charge markup"})`
      );
    return {
      service: s.service,
      provider: s.provider,
      minAmount: s.minAmount,
      maxAmount: s.maxAmount,
      chargeType: "FLAT" as const,
      chargeValue: dec(chargeValue),
      commissionType: "FLAT" as const,
      commissionValue: dec(commissionValue),
      parentSlabId: s.id,
      active: true,
    };
  });

  const mdrSlabData = base.mdrSlabs.map((s) => {
    const o = byMdrParent.get(s.id);
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
    return await prisma.scheme.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        active: true,
        ownerId: input.ownerId,
        parentSchemeId: base.id,
        slabs: { create: slabData },
        mdrSlabs: { create: mdrSlabData },
      },
      include: { slabs: true, mdrSlabs: true, _count: { select: { slabs: true, users: true } } },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new DerivedSchemeError("A scheme with this name already exists — pick another name");
    throw e;
  }
}

/**
 * Update a derived scheme the caller owns: name/description/active and slab
 * values (service + MDR), revalidated against the linked parent slabs.
 */
export async function updateDerivedScheme(
  ownerId: string,
  schemeId: string,
  input: {
    name?: string;
    description?: string | null;
    active?: boolean;
    slabs?: Array<{ id: string; chargeValue?: number; commissionValue?: number }>;
    mdrSlabs?: Array<{ id: string; mdrValue?: number; mdrValueT0?: number }>;
  }
) {
  const scheme = await prisma.scheme.findFirst({
    where: { id: schemeId, ownerId },
    include: { slabs: true, mdrSlabs: true },
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
      const chargeMarkup = chargeValue - Number(parent.chargeValue);
      const chargeDriven = isChargeDrivenService(slab.service);
      const maxCommission = chargeDriven ? chargeMarkup : chargeMarkup + Number(parent.commissionValue);
      if (commissionValue < 0 || commissionValue > maxCommission + 1e-9)
        throw new DerivedSchemeError(
          `Commission for ${slab.service} ₹${slab.minAmount}–₹${slab.maxAmount} must be between 0 and ${parseFloat(maxCommission.toFixed(4))} (${chargeDriven ? "your charge markup" : "your commission + charge markup"})`
        );
    }
    await prisma.schemeSlab.update({
      where: { id: slab.id },
      data: { chargeValue: dec(chargeValue), commissionValue: dec(commissionValue) },
    });
  }

  const parentMdrSlabs = scheme.parentSchemeId
    ? await prisma.mdrSlab.findMany({ where: { schemeId: scheme.parentSchemeId } })
    : [];
  const parentMdrById = new Map(parentMdrSlabs.map((s) => [s.id, s]));

  for (const edit of input.mdrSlabs ?? []) {
    const slab = scheme.mdrSlabs.find((s) => s.id === edit.id);
    if (!slab) throw new DerivedSchemeError(`MDR slab ${edit.id} does not belong to this scheme`);
    const parent = slab.parentSlabId ? parentMdrById.get(slab.parentSlabId) : undefined;

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
    return await prisma.scheme.update({
      where: { id: scheme.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { slabs: true, mdrSlabs: true, _count: { select: { slabs: true, users: true } } },
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
