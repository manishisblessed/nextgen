import type { MdrScheme, MdrSlab } from "@prisma/client";

/** JSON-safe shape for an MdrSlab (Decimals -> numbers). */
export function serializeMdrSlab(s: MdrSlab) {
  return {
    id: s.id,
    schemeId: s.schemeId,
    serviceKind: s.serviceKind,
    paymentMode: s.paymentMode,
    company: s.company,
    cardType: s.cardType,
    brandType: s.brandType,
    classification: s.classification,
    minAmount: Number(s.minAmount),
    maxAmount: Number(s.maxAmount),
    mdrType: s.mdrType,
    mdrValue: Number(s.mdrValue),
    mdrValueT0: Number(s.mdrValueT0),
    parentSlabId: s.parentSlabId,
    active: s.active,
  };
}

/** JSON-safe shape for an MdrScheme, optionally embedding counts + slabs. */
export function serializeMdrScheme(
  s: MdrScheme & { slabs?: MdrSlab[]; _count?: { slabs: number; users: number } }
) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    active: s.active,
    ownerId: s.ownerId,
    parentSchemeId: s.parentSchemeId,
    slabCount: s._count?.slabs ?? (s.slabs ? s.slabs.length : 0),
    userCount: s._count?.users ?? 0,
    slabs: s.slabs ? s.slabs.map(serializeMdrSlab) : undefined,
    createdAt: s.createdAt.toISOString(),
  };
}
