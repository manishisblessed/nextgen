import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { toFixedString } from "@/lib/money";

/**
 * Global default-scheme fallback tests.
 *
 * With SCHEME_DEFAULT_FALLBACK enabled, a user WITHOUT an explicit active
 * scheme is priced off the single active isDefault scheme. An explicit
 * assignment still wins; a nonexistent user never falls back; and when no
 * active default exists the result is NONE (fail-safe, never ₹0 silently).
 */

const state = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  schemes: [] as Record<string, unknown>[],
  slabs: [] as Record<string, unknown>[],
  flag: true,
}));

// Flag is read at call-time inside resolveUserScheme, so toggling state.flag
// between tests changes behaviour without re-importing.
vi.mock("@/lib/env", () => ({
  get flags() {
    return { schemeDefaultFallback: state.flag };
  },
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
          if (where.active && !s.active) return false;
          if (where.isDefault && !s.isDefault) return false;
          return true;
        }) ?? null,
    },
    schemeSlab: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.slabs.filter(
          (s) =>
            s.schemeId === where.schemeId &&
            (!where.service || s.service === where.service) &&
            (where.active === undefined || s.active === where.active)
        ),
    },
  },
}));

import { resolveUserScheme } from "@/lib/scheme/resolve-scheme";
import { getEffectiveRate } from "@/lib/scheme/resolver";

const d = (v: number | string) => new Prisma.Decimal(v);

function slab(overrides: Record<string, unknown>) {
  return {
    id: "dslab",
    schemeId: "default1",
    service: "DMT_IMPS",
    provider: null,
    minAmount: d(0),
    maxAmount: d(100000),
    chargeType: "FLAT",
    chargeValue: d(20),
    commissionType: "FLAT",
    commissionValue: d(3),
    chargeGstInclusive: false,
    vendorCharge: d(0),
    parentSlabId: null,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.flag = true;
  state.users = new Map([
    ["assigned", { id: "assigned", schemeId: "user1" }],
    ["unassigned", { id: "unassigned", schemeId: null }],
    ["inactiveScheme", { id: "inactiveScheme", schemeId: "user1" }],
  ]);
  state.schemes = [
    { id: "user1", name: "Gold", active: true, isDefault: false },
    { id: "default1", name: "Next_Gen_Default_Scheme", active: true, isDefault: true },
  ];
  state.slabs = [
    slab({ id: "userslab", schemeId: "user1", chargeValue: d(10), commissionValue: d(5) }),
    slab({ id: "defslab", schemeId: "default1", chargeValue: d(20), commissionValue: d(3) }),
  ];
});

describe("resolveUserScheme", () => {
  it("prefers the user's explicit active scheme over the default", async () => {
    const r = await resolveUserScheme("assigned");
    expect(r.source).toBe("USER_SCHEME");
    expect(r.schemeId).toBe("user1");
  });

  it("falls back to the platform default when the user has no scheme", async () => {
    const r = await resolveUserScheme("unassigned");
    expect(r.source).toBe("DEFAULT_SCHEME");
    expect(r.schemeId).toBe("default1");
    expect(r.schemeName).toBe("Next_Gen_Default_Scheme");
  });

  it("falls back to the default when the assigned scheme is inactive", async () => {
    state.schemes = [
      { id: "user1", name: "Gold", active: false, isDefault: false },
      { id: "default1", name: "Next_Gen_Default_Scheme", active: true, isDefault: true },
    ];
    const r = await resolveUserScheme("inactiveScheme");
    expect(r.source).toBe("DEFAULT_SCHEME");
    expect(r.schemeId).toBe("default1");
  });

  it("returns NONE for a nonexistent user (never falls back)", async () => {
    const r = await resolveUserScheme("ghost");
    expect(r.source).toBe("NONE");
    expect(r.schemeId).toBeNull();
  });

  it("returns NONE when the flag is off and no explicit scheme", async () => {
    state.flag = false;
    const r = await resolveUserScheme("unassigned");
    expect(r.source).toBe("NONE");
  });

  it("returns NONE when no active default exists", async () => {
    state.schemes = [{ id: "user1", name: "Gold", active: true, isDefault: false }];
    const r = await resolveUserScheme("unassigned");
    expect(r.source).toBe("NONE");
  });
});

describe("getEffectiveRate with default fallback", () => {
  it("prices an unassigned user off the default scheme slab", async () => {
    const rate = await getEffectiveRate("unassigned", "DMT_IMPS", 10000);
    expect(rate.source).toBe("DEFAULT_SCHEME");
    expect(rate.schemeId).toBe("default1");
    expect(toFixedString(rate.charge)).toBe("20.00");
    expect(toFixedString(rate.commission)).toBe("3.00");
  });

  it("still prices an assigned user off their own scheme slab", async () => {
    const rate = await getEffectiveRate("assigned", "DMT_IMPS", 10000);
    expect(rate.source).toBe("USER_SCHEME");
    expect(toFixedString(rate.charge)).toBe("10.00");
    expect(toFixedString(rate.commission)).toBe("5.00");
  });

  it("returns NONE for an unassigned user when the flag is off", async () => {
    state.flag = false;
    const rate = await getEffectiveRate("unassigned", "DMT_IMPS", 10000);
    expect(rate.source).toBe("NONE");
    expect(toFixedString(rate.charge)).toBe("0.00");
  });
});
