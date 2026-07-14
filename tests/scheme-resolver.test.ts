import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { toFixedString } from "@/lib/money";

/**
 * Scheme resolver tests — the pricing engine that decides what a user pays
 * (charge) and earns (commission) per service. A regression here silently
 * misprices every transaction on the platform.
 *
 * Cascade model: only the user's OWN assigned scheme resolves (no platform
 * default fallback), and resolvePricingChain turns per-tier scheme
 * differences into ancestor margins.
 */

// In-memory stand-ins for the tables the resolver reads.
const state = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  schemes: [] as Record<string, unknown>[],
  slabs: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.users.get(where.id) ?? null,
    },
    scheme: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.schemes.find((s) => {
          if (where.id && s.id !== where.id) return false;
          if (where.isDefault && !s.isDefault) return false;
          if (where.active && !s.active) return false;
          return true;
        }) ?? null,
    },
    schemeSlab: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.slabs.filter(
          (s) =>
            s.schemeId === where.schemeId &&
            (!where.service || s.service === where.service) &&
            (where.active === undefined || s.active === where.active) &&
            (!where.id ||
              (where.id as { not?: string }).not === undefined ||
              s.id !== (where.id as { not: string }).not)
        ),
    },
  },
}));

import {
  applyRate,
  getEffectiveRate,
  resolvePricingChain,
  validateNonOverlapping,
  PAYOUT_MODE_SERVICE,
} from "@/lib/scheme/resolver";

const d = (v: number | string) => new Prisma.Decimal(v);

function slab(overrides: Record<string, unknown>) {
  return {
    id: "slab1",
    schemeId: "scheme1",
    service: "DMT_IMPS",
    minAmount: d(0),
    maxAmount: d(100000),
    chargeType: "FLAT",
    chargeValue: d(10),
    commissionType: "PERCENT",
    commissionRetailer: d("0.0050"),
    commissionDistributor: d("0.0020"),
    commissionMaster: d("0.0010"),
    commissionSuperDistributor: d("0.0005"),
    commissionValue: d(0),
    parentSlabId: null,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.users = new Map([
    ["u1", { id: "u1", role: "RETAILER", schemeId: "scheme1", parentId: null, status: "ACTIVE" }],
  ]);
  state.schemes = [
    { id: "scheme1", name: "Gold", active: true, isDefault: false },
    { id: "default", name: "Platform Default", active: true, isDefault: true },
  ];
  state.slabs = [slab({ commissionValue: d("0.0050") })];
});

describe("applyRate", () => {
  it("FLAT returns the rupee value regardless of amount", () => {
    expect(toFixedString(applyRate(99999, "FLAT", "12.5"))).toBe("12.50");
  });

  it("PERCENT treats the value as a fraction (0.0050 = 0.5%)", () => {
    expect(toFixedString(applyRate(10000, "PERCENT", "0.0050"))).toBe("50.00");
    expect(toFixedString(applyRate(1234.56, "PERCENT", "0.0050"))).toBe("6.17");
  });
});

describe("getEffectiveRate", () => {
  it("resolves the user's own scheme", async () => {
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("USER_SCHEME");
    expect(rate.schemeName).toBe("Gold");
    expect(toFixedString(rate.charge)).toBe("10.00");
    // Own commission (cascade): 0.5% of 10,000
    expect(toFixedString(rate.commissionOwn)).toBe("50.00");
  });

  it("does NOT fall back to the platform default scheme (strict cascade)", async () => {
    // Only the default scheme has a matching slab — must still be NONE.
    state.slabs = [slab({ id: "slab-def", schemeId: "default", chargeValue: d(7) })];
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("NONE");
    expect(toFixedString(rate.charge)).toBe("0.00");
  });

  it("returns NONE when the user has no scheme assigned", async () => {
    state.users.set("u1", { id: "u1", role: "RETAILER", schemeId: null, parentId: null, status: "ACTIVE" });
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("NONE");
  });

  it("skips slabs whose band does not contain the amount", async () => {
    state.slabs = [slab({ minAmount: d(0), maxAmount: d(500) })];
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("NONE");
  });
});

describe("resolvePricingChain", () => {
  /**
   * Fixture chain (all FLAT for exact assertions):
   *   SD scheme: charge 5, commission 8   (assigned by admin)
   *   MD scheme: charge 6, commission 7   (derived by SD)
   *   DT scheme: charge 8, commission 6   (derived by MD)
   *   RT scheme: charge 10, commission 5  (derived by DT)
   */
  beforeEach(() => {
    state.users = new Map([
      ["rt", { id: "rt", role: "RETAILER", schemeId: "s-rt", parentId: "dt", status: "ACTIVE" }],
      ["dt", { id: "dt", role: "DISTRIBUTOR", schemeId: "s-dt", parentId: "md", status: "ACTIVE" }],
      ["md", { id: "md", role: "MASTER_DISTRIBUTOR", schemeId: "s-md", parentId: "sd", status: "ACTIVE" }],
      ["sd", { id: "sd", role: "SUPER_DISTRIBUTOR", schemeId: "s-sd", parentId: null, status: "ACTIVE" }],
    ]);
    state.schemes = [
      { id: "s-rt", name: "RT Plan", active: true },
      { id: "s-dt", name: "DT Plan", active: true },
      { id: "s-md", name: "MD Plan", active: true },
      { id: "s-sd", name: "SD Base", active: true },
    ];
    const mk = (schemeId: string, charge: number, commission: number) =>
      slab({
        id: `slab-${schemeId}`,
        schemeId,
        chargeType: "FLAT",
        chargeValue: d(charge),
        commissionType: "FLAT",
        commissionValue: d(commission),
      });
    state.slabs = [mk("s-rt", 10, 5), mk("s-dt", 8, 6), mk("s-md", 6, 7), mk("s-sd", 5, 8)];
  });

  it("computes each ancestor's gross as the scheme-difference margin", async () => {
    const chain = await resolvePricingChain("rt", "DMT_IMPS", 10000);
    expect(chain.ok).toBe(true);
    if (!chain.ok) return;

    expect(toFixedString(chain.userCharge)).toBe("10.00");
    expect(toFixedString(chain.userCommission)).toBe("5.00");
    expect(chain.members).toHaveLength(4);

    // RT earns their own commissionValue.
    expect(chain.members[0].userId).toBe("rt");
    expect(toFixedString(chain.members[0].gross)).toBe("5.00");
    // DT: (10-8) charge margin + (6-5) commission margin = 3
    expect(chain.members[1].userId).toBe("dt");
    expect(toFixedString(chain.members[1].gross)).toBe("3.00");
    // MD: (8-6) + (7-6) = 3
    expect(chain.members[2].userId).toBe("md");
    expect(toFixedString(chain.members[2].gross)).toBe("3.00");
    // SD: (6-5) + (8-7) = 2
    expect(chain.members[3].userId).toBe("sd");
    expect(toFixedString(chain.members[3].gross)).toBe("2.00");
  });

  it("a chain hole earns zero and passes the child's rate through", async () => {
    // DT loses their scheme: their margin must be 0, and MD's margin is
    // computed against RT's rate instead — nobody's margin is inflated.
    state.users.set("dt", { id: "dt", role: "DISTRIBUTOR", schemeId: null, parentId: "md", status: "ACTIVE" });
    const chain = await resolvePricingChain("rt", "DMT_IMPS", 10000);
    expect(chain.ok).toBe(true);
    if (!chain.ok) return;

    expect(toFixedString(chain.members[1].gross)).toBe("0.00");
    // MD vs RT: (10-6) + (7-5) = 6
    expect(toFixedString(chain.members[2].gross)).toBe("6.00");
    // SD unchanged: (6-5) + (8-7) = 2
    expect(toFixedString(chain.members[3].gross)).toBe("2.00");
  });

  it("never produces negative margins when a parent is priced higher", async () => {
    // DT scheme charges MORE than RT pays (misconfigured pre-cascade data).
    state.slabs = state.slabs.map((s) =>
      s.schemeId === "s-dt" ? { ...s, chargeValue: d(12), commissionValue: d(4) } : s
    );
    const chain = await resolvePricingChain("rt", "DMT_IMPS", 10000);
    expect(chain.ok).toBe(true);
    if (!chain.ok) return;
    // charge margin max(0, 10-12)=0; commission margin max(0, 4-5)=0
    expect(toFixedString(chain.members[1].gross)).toBe("0.00");
  });

  it("returns NO_SCHEME when the transacting user has no scheme", async () => {
    state.users.set("rt", { id: "rt", role: "RETAILER", schemeId: null, parentId: "dt", status: "ACTIVE" });
    const chain = await resolvePricingChain("rt", "DMT_IMPS", 10000);
    expect(chain).toEqual({ ok: false, reason: "NO_SCHEME" });
  });

  it("returns NO_SLAB when the user's scheme has no band for the amount", async () => {
    state.slabs = state.slabs.map((s) =>
      s.schemeId === "s-rt" ? { ...s, maxAmount: d(500) } : s
    );
    const chain = await resolvePricingChain("rt", "DMT_IMPS", 10000);
    expect(chain).toEqual({ ok: false, reason: "NO_SLAB" });
  });

  it("percent slabs resolve margins on the transaction amount", async () => {
    // RT 1% charge, DT 0.6% charge (both PERCENT, zero commission).
    const mk = (schemeId: string, fraction: string) =>
      slab({
        id: `slab-${schemeId}`,
        schemeId,
        chargeType: "PERCENT",
        chargeValue: d(fraction),
        commissionType: "FLAT",
        commissionValue: d(0),
      });
    state.slabs = [mk("s-rt", "0.0100"), mk("s-dt", "0.0060"), mk("s-md", "0.0060"), mk("s-sd", "0.0060")];
    const chain = await resolvePricingChain("rt", "DMT_IMPS", 10000);
    expect(chain.ok).toBe(true);
    if (!chain.ok) return;
    expect(toFixedString(chain.userCharge)).toBe("100.00");
    // DT margin: 100 - 60 = 40; MD/SD margin 0 (same rate).
    expect(toFixedString(chain.members[1].gross)).toBe("40.00");
    expect(toFixedString(chain.members[2].gross)).toBe("0.00");
    expect(toFixedString(chain.members[3].gross)).toBe("0.00");
  });
});

describe("validateNonOverlapping", () => {
  it("rejects min > max", async () => {
    const err = await validateNonOverlapping("scheme1", "DMT_IMPS", {
      minAmount: 100,
      maxAmount: 50,
    });
    expect(err).toMatch(/less than or equal/);
  });

  it("rejects a band overlapping an existing active slab", async () => {
    const err = await validateNonOverlapping("scheme1", "DMT_IMPS", {
      minAmount: 50000,
      maxAmount: 150000,
    });
    expect(err).toMatch(/overlaps/);
  });

  it("accepts a disjoint band", async () => {
    const err = await validateNonOverlapping("scheme1", "DMT_IMPS", {
      minAmount: 100001,
      maxAmount: 200000,
    });
    expect(err).toBeNull();
  });
});

describe("payout mode → service mapping", () => {
  it("maps every payout mode to a scheme service code", () => {
    expect(PAYOUT_MODE_SERVICE.IMPS).toBe("DMT_IMPS");
    expect(PAYOUT_MODE_SERVICE.NEFT).toBe("DMT_NEFT");
    expect(PAYOUT_MODE_SERVICE.RTGS).toBe("DMT_RTGS");
    expect(PAYOUT_MODE_SERVICE.UPI).toBe("UPI_PAYOUT");
  });
});
