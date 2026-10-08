import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./helpers/fakeDb";

/**
 * HARD RULE: a retailer whose assigned scheme cannot price a PG top-up (no PG
 * MDR slab for the provider scope) must be BLOCKED from funding the wallet via
 * the payment gateway — at initiation, before any order is created. We never
 * take money we cannot price.
 */

const holder = vi.hoisted(() => ({
  db: undefined as unknown as FakeDb,
  mdrSource: "NONE" as string,
  collectCalls: 0,
}));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop) => (holder.db as unknown as Record<PropertyKey, unknown>)[prop] }
  ),
}));

vi.mock("@/lib/partners", () => {
  // A Chagans-shaped provider double (name = CHAGANS_PG = the MDR scopeKey).
  const chagans = {
    name: "CHAGANS_PG",
    webhookOnly: true,
    collect: async () => {
      holder.collectCalls += 1;
      return { ok: true, data: { orderId: "CPG_TEST", paymentUrl: "https://pay.chagans/x" } };
    },
    status: async () => ({ ok: false, code: "NO_STATUS_API", message: "webhook only" }),
  };
  return {
    getPartner: () => chagans,
    getUpiProviderByName: () => chagans,
    resolveUpiSelection: () => ({ provider: chagans, channel: "comet", prepareAmount: (a: number) => a }),
    assertRealMoneyProvider: () => {},
  };
});

// Override only the priceability probe; keep the rest of the resolver real so
// the wider import graph (engine/distribute) still loads.
vi.mock("@/lib/mdr/resolver", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getEffectiveMdr: async () => ({ source: holder.mdrSource }),
  };
});

import { initiateTopup, TopupError } from "@/lib/wallet/topup";

beforeEach(() => {
  holder.db = new FakeDb();
  holder.db.addUser("r1", 0, 0, "ACTIVE", 0, { role: "RETAILER" });
  holder.mdrSource = "NONE";
  holder.collectCalls = 0;
});

describe("initiateTopup — PG-MDR block (HARD RULE)", () => {
  it("throws PG_NO_SCHEME and creates NO order when the scheme can't price a PG top-up", async () => {
    holder.mdrSource = "NONE";
    await expect(
      initiateTopup({ userId: "r1", amount: 500, customerPhone: "+919000000204", channel: "chagans:comet" })
    ).rejects.toMatchObject({ code: "PG_NO_SCHEME", statusCode: 403 });
    // Blocked BEFORE any Chagans order is opened, and no Transaction row minted.
    expect(holder.collectCalls).toBe(0);
    expect(holder.db.transactions).toHaveLength(0);
  });

  it("proceeds to open the order when the scheme CAN price a PG top-up", async () => {
    holder.mdrSource = "SCHEME";
    const r = await initiateTopup({
      userId: "r1",
      amount: 500,
      customerPhone: "+919000000204",
      channel: "chagans:comet",
    });
    expect(r.provider).toBe("CHAGANS_PG");
    expect(r.orderId).toBe("CPG_TEST");
    expect(holder.collectCalls).toBe(1);
    expect(holder.db.transactions[0].status).toBe("PROCESSING");
    // The per-gateway pricing scope is locked at initiation so settle reuses it
    // (Comet → CHAGANS_COMET, kept distinct from Star).
    expect(
      (holder.db.transactions[0].request as { pgScope?: string }).pgScope
    ).toBe("CHAGANS_COMET");
  });

  it("surfaces as a TopupError (so the API returns a clean 403)", async () => {
    holder.mdrSource = "NONE";
    await expect(
      initiateTopup({ userId: "r1", amount: 500, customerPhone: "9000000204", channel: "chagans:comet" })
    ).rejects.toBeInstanceOf(TopupError);
  });
});
