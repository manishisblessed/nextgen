import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { toFixedString } from "@/lib/money";

/**
 * Cascade system tests — TDS math, margin-based commission distribution,
 * the strict "no scheme, no transaction" gate, and derived-scheme bounds
 * validation. Money regressions here mean wrong payouts to the network.
 */

const state = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  schemes: [] as Record<string, unknown>[],
  slabs: [] as Record<string, unknown>[],
  mdrSchemes: [] as Record<string, unknown>[],
  mdrSlabs: [] as Record<string, unknown>[],
  commissionCredits: [] as Record<string, unknown>[],
  walletCredits: [] as Record<string, unknown>[],
  createdSchemes: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.users.get(where.id) ?? null,
    },
    scheme: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = state.schemes.find((s) => {
          if (where.id && s.id !== where.id) return false;
          if (where.active && !s.active) return false;
          if (where.ownerId && s.ownerId !== where.ownerId) return false;
          return true;
        });
        if (!found) return null;
        // Emulate `include: { slabs, mdrSlabs }` used by the derived-scheme lib
        // (unified model: MDR slabs live on the same Scheme).
        return {
          ...found,
          slabs: state.slabs.filter((sl) => sl.schemeId === found.id && sl.active),
          mdrSlabs: state.mdrSlabs.filter((sl) => sl.schemeId === found.id && sl.active),
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `created-${state.createdSchemes.length + 1}`, ...data };
        state.createdSchemes.push(created);
        return { ...created, slabs: [], mdrSlabs: [], _count: { slabs: 0, users: 0, mdrSlabs: 0 } };
      },
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
    mdrSlab: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.mdrSlabs.filter(
          (s) =>
            s.schemeId === where.schemeId &&
            (!where.serviceKind || s.serviceKind === where.serviceKind) &&
            (where.active === undefined || s.active === where.active)
        ),
    },
    commissionCredit: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.commissionCredits.push(data);
        return { id: `cc-${state.commissionCredits.length}`, ...data };
      },
    },
  },
}));

vi.mock("@/lib/ledger", () => ({
  creditWallet: async (input: Record<string, unknown>) => {
    state.walletCredits.push(input);
    return { id: `wt-${state.walletCredits.length}` };
  },
}));

import { applyTds, distributeCommission, TDS_RATE } from "@/lib/commission/distribute";
import { requireActiveScheme, NoSchemeError } from "@/lib/scheme/gate";
import { createDerivedScheme, DerivedSchemeError } from "@/lib/scheme/derived";
import { dec } from "@/lib/money";

const d = (v: number | string) => new Prisma.Decimal(v);

function slab(overrides: Record<string, unknown>) {
  return {
    id: "slab1",
    schemeId: "scheme1",
    service: "BILL_ELECTRICITY",
    minAmount: d(0),
    maxAmount: d(100000),
    chargeType: "FLAT",
    chargeValue: d(0),
    commissionType: "FLAT",
    commissionValue: d(0),
    parentSlabId: null,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.users = new Map();
  state.schemes = [];
  state.slabs = [];
  state.mdrSchemes = [];
  state.mdrSlabs = [];
  state.commissionCredits = [];
  state.walletCredits = [];
  state.createdSchemes = [];
});

describe("applyTds", () => {
  it("withholds exactly 2%", () => {
    expect(TDS_RATE).toBe(0.02);
    const { tds, net } = applyTds(dec(100));
    expect(toFixedString(tds)).toBe("2.00");
    expect(toFixedString(net)).toBe("98.00");
  });

  it("rounds at money scale and net + tds always equals gross", () => {
    // 2% of 3.33 = 0.0666 → rounds to 0.07; net = 3.26.
    const { tds, net } = applyTds(dec("3.33"));
    expect(toFixedString(tds)).toBe("0.07");
    expect(toFixedString(net)).toBe("3.26");
    expect(toFixedString(net.add(tds))).toBe("3.33");
  });
});

describe("distributeCommission (pool model, margin-based with TDS)", () => {
  beforeEach(() => {
    // Pool service (DMT_IMPS): margin = charge markup + retained commission.
    state.users = new Map([
      ["rt", { id: "rt", role: "RETAILER", schemeId: "s-rt", parentId: "dt", status: "ACTIVE" }],
      ["dt", { id: "dt", role: "DISTRIBUTOR", schemeId: "s-dt", parentId: null, status: "ACTIVE" }],
    ]);
    state.schemes = [
      { id: "s-rt", name: "RT Plan", active: true },
      { id: "s-dt", name: "DT Plan", active: true },
    ];
    state.slabs = [
      slab({ id: "sl-rt", schemeId: "s-rt", service: "DMT_IMPS", chargeValue: d(10), commissionValue: d(100) }),
      slab({ id: "sl-dt", schemeId: "s-dt", service: "DMT_IMPS", chargeValue: d(8), commissionValue: d(150) }),
    ];
  });

  it("credits NET of TDS and records gross/tds/net per tier", async () => {
    const credits = await distributeCommission("txn1", "rt", "DMT_IMPS", 10000);

    expect(credits).toHaveLength(2);

    // RT: gross 100 → TDS 2 → net 98
    expect(credits[0]).toMatchObject({ userId: "rt", tier: "RETAILER", gross: 100, tds: 2, amount: 98 });
    // DT: charge margin (10-8)=2 + commission margin (150-100)=50 → gross 52 → net 50.96
    expect(credits[1]).toMatchObject({ userId: "dt", tier: "DISTRIBUTOR", gross: 52, tds: 1.04, amount: 50.96 });

    // Wallet credited with the NET amount, idempotency-keyed per txn+user.
    expect(state.walletCredits).toHaveLength(2);
    expect(toFixedString(state.walletCredits[0].amount as never)).toBe("98.00");
    expect(state.walletCredits[0].idempotencyKey).toBe("commission:txn1:rt");

    // CommissionCredit rows persist the full breakdown.
    expect(toFixedString(state.commissionCredits[0].grossAmount as never)).toBe("100.00");
    expect(toFixedString(state.commissionCredits[0].tdsAmount as never)).toBe("2.00");
    expect(toFixedString(state.commissionCredits[0].amount as never)).toBe("98.00");
  });

  it("pays nothing when the transacting user has no scheme", async () => {
    state.users.set("rt", { id: "rt", role: "RETAILER", schemeId: null, parentId: "dt", status: "ACTIVE" });
    const credits = await distributeCommission("txn1", "rt", "DMT_IMPS", 10000);
    expect(credits).toHaveLength(0);
    expect(state.walletCredits).toHaveLength(0);
  });

  it("skips zero-margin tiers instead of writing empty credits", async () => {
    // DT prices identically to RT — no margin, no credit for DT.
    state.slabs = [
      slab({ id: "sl-rt", schemeId: "s-rt", service: "DMT_IMPS", chargeValue: d(10), commissionValue: d(0) }),
      slab({ id: "sl-dt", schemeId: "s-dt", service: "DMT_IMPS", chargeValue: d(10), commissionValue: d(0) }),
    ];
    const credits = await distributeCommission("txn1", "rt", "DMT_IMPS", 10000);
    expect(credits).toHaveLength(0);
  });
});

describe("distributeCommission (BBPS/Payout charge-driven model)", () => {
  beforeEach(() => {
    // Charge-driven (BILL_ELECTRICITY): parent margin = charge markup − child
    // commission. RT charges 20 & earns 2; DT's rate is 15 → DT margin = 3.
    state.users = new Map([
      ["rt", { id: "rt", role: "RETAILER", schemeId: "s-rt", parentId: "dt", status: "ACTIVE" }],
      ["dt", { id: "dt", role: "DISTRIBUTOR", schemeId: "s-dt", parentId: null, status: "ACTIVE" }],
    ]);
    state.schemes = [
      { id: "s-rt", name: "RT Plan", active: true },
      { id: "s-dt", name: "DT Plan", active: true },
    ];
    state.slabs = [
      slab({ id: "sl-rt", schemeId: "s-rt", service: "BILL_ELECTRICITY", chargeValue: d(20), commissionValue: d(2) }),
      slab({ id: "sl-dt", schemeId: "s-dt", service: "BILL_ELECTRICITY", chargeValue: d(15), commissionValue: d(2.5) }),
    ];
  });

  it("funds the child's commission out of the parent's charge markup", async () => {
    const credits = await distributeCommission("txn1", "rt", "BILL_ELECTRICITY", 500);
    expect(credits).toHaveLength(2);
    // RT (leaf) earns their own commission = 2.
    expect(credits[0]).toMatchObject({ userId: "rt", tier: "RETAILER", gross: 2 });
    // DT margin = charge markup (20-15)=5 − child commission (2) = 3.
    expect(credits[1]).toMatchObject({ userId: "dt", tier: "DISTRIBUTOR", gross: 3 });
  });
});

describe("requireActiveScheme (strict gate)", () => {
  it("throws NoSchemeError for a network user without a scheme", async () => {
    state.users.set("rt", { id: "rt", role: "RETAILER", scheme: null });
    await expect(requireActiveScheme("rt")).rejects.toBeInstanceOf(NoSchemeError);
  });

  it("throws when the assigned scheme is inactive", async () => {
    state.users.set("rt", { id: "rt", role: "RETAILER", scheme: { id: "s1", active: false } });
    await expect(requireActiveScheme("rt")).rejects.toBeInstanceOf(NoSchemeError);
  });

  it("passes with an active scheme", async () => {
    state.users.set("rt", { id: "rt", role: "RETAILER", scheme: { id: "s1", active: true } });
    await expect(requireActiveScheme("rt")).resolves.toBeUndefined();
  });

  it("treats the unified scheme as covering MDR too (mdr option is a no-op)", async () => {
    // The single scheme now carries both service and MDR slabs, so an active
    // scheme satisfies requireActiveScheme even when { mdr: true } is passed.
    state.users.set("rt", { id: "rt", role: "RETAILER", scheme: { id: "s1", active: true } });
    await expect(requireActiveScheme("rt", { mdr: true })).resolves.toBeUndefined();
  });

  it("exempts staff roles", async () => {
    state.users.set("adm", { id: "adm", role: "ADMIN", scheme: null });
    await expect(requireActiveScheme("adm")).resolves.toBeUndefined();
  });
});

describe("createDerivedScheme (parent-bound validation)", () => {
  beforeEach(() => {
    state.users.set("dt", { id: "dt", role: "DISTRIBUTOR", schemeId: "s-dt", parentId: "md", status: "ACTIVE" });
    state.schemes = [{ id: "s-dt", name: "DT Plan", active: true }];
    state.slabs = [
      slab({ id: "sl-dt", schemeId: "s-dt", chargeValue: d(8), commissionValue: d(150) }),
    ];
  });

  it("rejects a charge below the parent's rate", async () => {
    await expect(
      createDerivedScheme({
        ownerId: "dt",
        name: "Bad Plan",
        overrides: [{ parentSlabId: "sl-dt", chargeValue: 7 }],
      })
    ).rejects.toBeInstanceOf(DerivedSchemeError);
  });

  it("rejects a BBPS commission above the charge markup", async () => {
    // Charge-driven: child commission must be <= charge markup (10-8 = 2).
    await expect(
      createDerivedScheme({
        ownerId: "dt",
        name: "Bad Plan",
        overrides: [{ parentSlabId: "sl-dt", chargeValue: 10, commissionValue: 3 }],
      })
    ).rejects.toBeInstanceOf(DerivedSchemeError);
  });

  it("rejects overrides for slabs that are not the caller's", async () => {
    await expect(
      createDerivedScheme({
        ownerId: "dt",
        name: "Bad Plan",
        overrides: [{ parentSlabId: "someone-elses-slab", chargeValue: 99 }],
      })
    ).rejects.toBeInstanceOf(DerivedSchemeError);
  });

  it("rejects callers with no scheme of their own", async () => {
    state.users.set("dt", { id: "dt", role: "DISTRIBUTOR", schemeId: null, parentId: "md", status: "ACTIVE" });
    await expect(
      createDerivedScheme({ ownerId: "dt", name: "Plan" })
    ).rejects.toBeInstanceOf(DerivedSchemeError);
  });

  it("rejects retailers (they cannot derive schemes)", async () => {
    state.users.set("rt", { id: "rt", role: "RETAILER", schemeId: "s-dt" });
    await expect(
      createDerivedScheme({ ownerId: "rt", name: "Plan" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("creates a scheme with bands + types locked to the parent and marked with lineage", async () => {
    // Charge-driven bound: child commission (2) <= charge markup (12-8 = 4).
    const scheme = await createDerivedScheme({
      ownerId: "dt",
      name: "Retail Silver",
      overrides: [{ parentSlabId: "sl-dt", chargeValue: 12, commissionValue: 2 }],
    });
    expect(scheme.id).toBeDefined();
    const created = state.createdSchemes[0] as {
      ownerId: string;
      parentSchemeId: string;
      slabs: { create: Array<Record<string, unknown>> };
    };
    expect(created.ownerId).toBe("dt");
    expect(created.parentSchemeId).toBe("s-dt");
    const s = created.slabs.create[0];
    expect(s.parentSlabId).toBe("sl-dt");
    expect(s.service).toBe("BILL_ELECTRICITY");
    expect(toFixedString(s.chargeValue as never)).toBe("12.00");
    expect(toFixedString(s.commissionValue as never)).toBe("2.00");
  });
});
