import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * handleTopupCapture — the net-of-MDR settlement of a confirmed wallet top-up,
 * priced through the REAL priceSchemeSettlement engine (gross − MDR), with the
 * ledger / payin / commission collaborators mocked. Proves:
 *   - net math (gross − MDR) is what gets credited,
 *   - the HARD RULE (unpriced → NO_SCHEME, never credit),
 *   - the vendor-cost guard (MDR below acquirer cost → NO_SCHEME),
 *   - idempotency (already captured → DUPLICATE, no second credit),
 *   - a failed credit parks PENDING (QUEUED) with no commission.
 */

const holder = vi.hoisted(() => ({
  entries: [] as Record<string, unknown>[],
  txns: [] as Record<string, unknown>[],
  users: new Map<string, Record<string, unknown>>(),
  credits: [] as Record<string, unknown>[],
  payins: [] as Record<string, unknown>[],
  distributeCalls: 0,
  mdr: { source: "SCHEME", mdr: 10, schemeId: "sch1", slabId: "slab1" } as Record<string, unknown>,
  railVendor: null as null | Record<string, unknown>,
  floorOk: true,
  creditShouldThrow: false,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pgSettlementEntry: {
      findUnique: async ({ where }: { where: { transactionRef: string } }) =>
        holder.entries.find((e) => e.transactionRef === where.transactionRef) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `e${holder.entries.length + 1}`, ...data };
        holder.entries.push(row);
        return row;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => holder.users.get(where.id) ?? null,
    },
    transaction: {
      findUnique: async ({ where }: { where: { refId?: string } }) =>
        holder.txns.find((t) => t.refId === where.refId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `t${holder.txns.length + 1}`, ...data };
        holder.txns.push(row);
        return row;
      },
    },
  },
}));

vi.mock("@/lib/ledger", () => ({
  creditWallet: async (input: Record<string, unknown>) => {
    if (holder.creditShouldThrow) throw new Error("ledger down");
    holder.credits.push(input);
    return { id: `w${holder.credits.length}` };
  },
}));

vi.mock("@/lib/wallet/payin", () => ({
  recordPayin: async (input: Record<string, unknown>) => {
    holder.payins.push(input);
  },
}));

vi.mock("@/lib/commission/distribute", () => ({
  distributeMdrCommission: async () => {
    holder.distributeCalls += 1;
    return [];
  },
}));

vi.mock("@/lib/mdr/resolver", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getEffectiveMdr: async () => holder.mdr,
}));

vi.mock("@/lib/mdr/floor", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isAboveMdrFloor: async () => holder.floorOk,
}));

vi.mock("@/lib/rail/mdr", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  resolveRailMdr: async () => holder.railVendor,
}));

import { handleTopupCapture } from "@/lib/settlement/pg";

const baseInput = () => ({
  transactionRef: "TOPUPTEST1",
  orderId: "CPG_1",
  userId: "r1",
  grossAmount: 100.31,
  paymentMode: "CARD",
  scopeKey: "CHAGANS_PG",
});

beforeEach(() => {
  holder.entries = [];
  holder.txns = [];
  holder.users = new Map([["r1", { id: "r1", status: "ACTIVE" }]]);
  holder.credits = [];
  holder.payins = [];
  holder.distributeCalls = 0;
  holder.mdr = { source: "SCHEME", mdr: 10, schemeId: "sch1", slabId: "slab1" };
  holder.railVendor = null;
  holder.floorOk = true;
  holder.creditShouldThrow = false;
});

describe("handleTopupCapture", () => {
  it("credits NET (gross − MDR) and books the PG settlement + commission", async () => {
    const r = await handleTopupCapture(baseInput());
    expect(r.status).toBe("SETTLED");
    expect(r.netAmount).toBe(90.31); // 100.31 − 10
    expect(r.mdrAmount).toBe(10);

    // The single money movement: a NET credit keyed for idempotency.
    expect(holder.credits).toHaveLength(1);
    expect(String(holder.credits[0].amount)).toBe("90.31");
    expect(holder.credits[0].reason).toBe("SETTLEMENT");
    expect(holder.credits[0].idempotencyKey).toBe("pg-settle:TOPUPTEST1");

    // GROSS mirrored into the PG payin rail.
    expect(holder.payins).toHaveLength(1);
    expect(holder.payins[0].rail).toBe("PG");
    expect(Number(holder.payins[0].grossAmount)).toBe(100.31);

    // A SETTLED INSTANT entry + upline commission distribution.
    expect(holder.entries).toHaveLength(1);
    expect(holder.entries[0].status).toBe("SETTLED");
    expect(holder.entries[0].mode).toBe("INSTANT");
    expect(holder.entries[0].paymentMode).toBe("CARD");
    expect(holder.distributeCalls).toBe(1);
  });

  it("defaults the payment mode to UPI when the webhook sent none", async () => {
    const r = await handleTopupCapture({ ...baseInput(), paymentMode: undefined });
    expect(r.status).toBe("SETTLED");
    expect(holder.entries[0].paymentMode).toBe("UPI");
  });

  it("HARD RULE: returns NO_SCHEME and credits NOTHING when unpriced", async () => {
    holder.mdr = { source: "NONE" };
    const r = await handleTopupCapture(baseInput());
    expect(r.status).toBe("NO_SCHEME");
    expect(holder.credits).toHaveLength(0);
    expect(holder.entries).toHaveLength(0);
    expect(holder.distributeCalls).toBe(0);
  });

  it("refuses to settle below acquirer cost (vendor MDR > scheme MDR → NO_SCHEME)", async () => {
    holder.railVendor = { rateId: "rr1", mdrType: "FLAT", mdr: 20 }; // > scheme MDR 10
    const r = await handleTopupCapture(baseInput());
    expect(r.status).toBe("NO_SCHEME");
    expect(holder.credits).toHaveLength(0);
  });

  it("is idempotent — an already-captured ref returns DUPLICATE, no new credit", async () => {
    holder.entries.push({ transactionRef: "TOPUPTEST1", netAmount: 90.31, mdrAmount: 10 });
    const r = await handleTopupCapture(baseInput());
    expect(r.status).toBe("DUPLICATE");
    expect(holder.credits).toHaveLength(0);
  });

  it("skips inactive users", async () => {
    holder.users.set("r1", { id: "r1", status: "SUSPENDED" });
    const r = await handleTopupCapture(baseInput());
    expect(r.status).toBe("SKIPPED");
    expect(holder.credits).toHaveLength(0);
  });

  it("parks PENDING (QUEUED) with no commission when the credit fails mid-flight", async () => {
    holder.creditShouldThrow = true;
    const r = await handleTopupCapture(baseInput());
    expect(r.status).toBe("QUEUED");
    expect(holder.entries).toHaveLength(1);
    expect(holder.entries[0].status).toBe("PENDING");
    expect(holder.distributeCalls).toBe(0); // commission waits for the safety-net sweep
  });
});
