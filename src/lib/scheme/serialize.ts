import type { Scheme, SchemeSlab } from "@prisma/client";

/** JSON-safe shape for a SchemeSlab (Decimals -> numbers). */
export function serializeSlab(s: SchemeSlab) {
  return {
    id: s.id,
    schemeId: s.schemeId,
    service: s.service,
    provider: s.provider,
    minAmount: Number(s.minAmount),
    maxAmount: Number(s.maxAmount),
    chargeType: s.chargeType,
    chargeValue: Number(s.chargeValue),
    commissionType: s.commissionType,
    commissionRetailer: Number(s.commissionRetailer),
    commissionDistributor: Number(s.commissionDistributor),
    commissionMaster: Number(s.commissionMaster),
    commissionSuperDistributor: Number(s.commissionSuperDistributor),
    commissionValue: Number(s.commissionValue),
    parentSlabId: s.parentSlabId,
    active: s.active,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

type SchemeWithCounts = Scheme & {
  _count?: { slabs: number; users: number };
  slabs?: SchemeSlab[];
};

/** JSON-safe shape for a Scheme, optionally embedding counts + slabs. */
export function serializeScheme(s: SchemeWithCounts) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    active: s.active,
    isDefault: s.isDefault,
    createdById: s.createdById,
    ownerId: s.ownerId,
    parentSchemeId: s.parentSchemeId,
    slabCount: s._count?.slabs ?? (s.slabs ? s.slabs.length : 0),
    userCount: s._count?.users ?? 0,
    slabs: s.slabs ? s.slabs.map(serializeSlab) : undefined,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export type SerializedScheme = ReturnType<typeof serializeScheme>;
export type SerializedSlab = ReturnType<typeof serializeSlab>;
