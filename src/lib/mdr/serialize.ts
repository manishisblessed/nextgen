import type { MdrSlab } from "@prisma/client";

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
    vendorCharge: Number(s.vendorCharge),
    vendorChargeT0: Number(s.vendorChargeT0),
    commissionType: s.commissionType,
    commissionDistributor: Number(s.commissionDistributor),
    commissionMaster: Number(s.commissionMaster),
    commissionSuperDistributor: Number(s.commissionSuperDistributor),
    parentSlabId: s.parentSlabId,
    active: s.active,
  };
}
