import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PG wallet top-ups price by SCOPE (gateway), not by the funding instrument —
 * the customer picks UPI/card/netbanking on the hosted page, so a mode-pinned
 * scheme slab (e.g. CARD) must still resolve for the enable check, quote and
 * settle. This is the `anyPaymentMode` resolver option. Regression guard for
 * the "Payment Gateway isn't enabled" bug where a CARD-pinned CHAGANS_COMET
 * slab was scored ineligible against the UPI-default / mode-agnostic probe.
 */

const state = vi.hoisted(() => ({ slabs: [] as Record<string, unknown>[] }));

vi.mock("@/lib/db", () => ({
  prisma: {
    mdrSlab: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.slabs.filter(
          (s) => s.schemeId === where.schemeId && s.serviceKind === where.serviceKind && s.active
        ),
    },
  },
}));

vi.mock("@/lib/scheme/resolve-scheme", () => ({
  resolveUserScheme: async () => ({ source: "ASSIGNED", schemeId: "s1", schemeName: "Plan" }),
}));

vi.mock("@/lib/settings", () => ({
  isCardClassificationEnabled: async () => false,
}));

import { getEffectiveMdr } from "@/lib/mdr/resolver";

function cardSlab(over: Record<string, unknown> = {}) {
  return {
    id: "slab-card",
    schemeId: "s1",
    serviceKind: "PG",
    active: true,
    paymentMode: "CARD", // pinned to CARD
    company: "CHAGANS_COMET",
    cardType: null,
    brandType: null,
    classification: null,
    minAmount: 10,
    maxAmount: 100000,
    mdrType: "PERCENT",
    mdrValue: 0.016, // 1.60%
    mdrValueT0: 0.018, // 1.80%
    vendorCharge: 0.01,
    vendorChargeT0: 0.01,
    commissionType: "PERCENT",
    commissionRetailer: 0,
    commissionDistributor: 0,
    commissionMaster: 0,
    commissionSuperDistributor: 0,
    commissionDistributorT0: 0,
    commissionMasterT0: 0,
    commissionSuperDistributorT0: 0,
    ...over,
  };
}

beforeEach(() => {
  state.slabs = [cardSlab()];
});

describe("getEffectiveMdr — anyPaymentMode (PG top-up scope pricing)", () => {
  it("does NOT match a CARD-pinned slab for a UPI-mode probe (the old bug)", async () => {
    const r = await getEffectiveMdr("u1", "PG", 500, {
      paymentMode: "UPI",
      company: "CHAGANS_COMET",
      settlementType: "T0",
    });
    expect(r.source).toBe("NONE");
  });

  it("does NOT match a CARD-pinned slab for a mode-agnostic (undefined) probe", async () => {
    const r = await getEffectiveMdr("u1", "PG", 500, {
      company: "CHAGANS_COMET",
      settlementType: "T0",
    });
    expect(r.source).toBe("NONE");
  });

  it("MATCHES a CARD-pinned slab when anyPaymentMode is set — prices by scope", async () => {
    const r = await getEffectiveMdr("u1", "PG", 500, {
      company: "CHAGANS_COMET",
      settlementType: "T0",
      anyPaymentMode: true,
    });
    expect(r.source).toBe("ASSIGNED");
    expect(r.slabId).toBe("slab-card");
    // T0 leg: 1.80% of 500 = 9.00
    expect(Number(r.mdr)).toBeCloseTo(9, 2);
    // vendor 1.00% of 500 = 5.00 → margin 4.00
    expect(Number(r.vendor)).toBeCloseTo(5, 2);
    expect(Number(r.margin)).toBeCloseTo(4, 2);
  });

  it("still respects the SCOPE even with anyPaymentMode (wrong gateway → no match)", async () => {
    const r = await getEffectiveMdr("u1", "PG", 500, {
      company: "CHAGANS_STAR", // no STAR slab configured
      settlementType: "T0",
      anyPaymentMode: true,
    });
    expect(r.source).toBe("NONE");
  });

  it("still respects the amount band even with anyPaymentMode", async () => {
    const r = await getEffectiveMdr("u1", "PG", 5, {
      company: "CHAGANS_COMET", // below the ₹10 band floor
      settlementType: "T0",
      anyPaymentMode: true,
    });
    expect(r.source).toBe("NONE");
  });
});
