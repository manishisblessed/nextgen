import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { toFixedString } from "@/lib/money";

/**
 * Scheme resolver tests — the pricing engine that decides what a user pays
 * (charge) and earns (commission) per service. A regression here silently
 * misprices every transaction on the platform.
 */

// In-memory stand-ins for the three tables the resolver reads.
const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  schemes: [] as Record<string, unknown>[],
  slabs: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async () => state.user,
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
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.user = { role: "RETAILER", schemeId: "scheme1" };
  state.schemes = [
    { id: "scheme1", name: "Gold", active: true, isDefault: false },
    { id: "default", name: "Platform Default", active: true, isDefault: true },
  ];
  state.slabs = [slab({})];
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
  it("resolves the user's own scheme first", async () => {
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("USER_SCHEME");
    expect(rate.schemeName).toBe("Gold");
    expect(toFixedString(rate.charge)).toBe("10.00");
    // Retailer commission: 0.5% of 10,000
    expect(toFixedString(rate.commissionForUser)).toBe("50.00");
    expect(toFixedString(rate.commission.superDistributor)).toBe("5.00");
  });

  it("falls back to the platform default scheme when the user scheme has no slab", async () => {
    state.slabs = [slab({ id: "slab-def", schemeId: "default", chargeValue: d(7) })];
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("DEFAULT_SCHEME");
    expect(toFixedString(rate.charge)).toBe("7.00");
  });

  it("returns a zeroed NONE result when no slab matches anywhere", async () => {
    state.slabs = [];
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("NONE");
    expect(toFixedString(rate.charge)).toBe("0.00");
    expect(toFixedString(rate.commissionForUser)).toBe("0.00");
  });

  it("skips slabs whose band does not contain the amount", async () => {
    state.slabs = [slab({ minAmount: d(0), maxAmount: d(500) })];
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    expect(rate.source).toBe("NONE");
  });

  it("picks the commission for the resolving user's role", async () => {
    state.user = { role: "DISTRIBUTOR", schemeId: "scheme1" };
    const rate = await getEffectiveRate("u1", "DMT_IMPS", 10000);
    // Distributor commission: 0.2% of 10,000
    expect(toFixedString(rate.commissionForUser)).toBe("20.00");
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
