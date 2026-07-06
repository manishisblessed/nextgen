import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./helpers/fakeDb";

/**
 * Wallet ledger tests — every rupee on the platform moves through these
 * functions. The invariants under test:
 *   - no overspend past spendable (walletBalance − heldBalance)
 *   - idempotency keys make retries a no-op
 *   - hold / release / capture keep both balances consistent
 *   - every settled movement writes a passbook row with balanceAfter
 */

const holder = vi.hoisted(() => ({ db: undefined as unknown as FakeDb }));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop) => (holder.db as unknown as Record<PropertyKey, unknown>)[prop] }
  ),
}));

import {
  creditWallet,
  debitWallet,
  holdFunds,
  releaseHold,
  captureHold,
  LedgerError,
} from "@/lib/ledger";

beforeEach(() => {
  holder.db = new FakeDb();
  holder.db.addUser("u1", 1000);
});

describe("creditWallet", () => {
  it("increases the balance and writes a passbook row", async () => {
    const txn = await creditWallet({ userId: "u1", amount: 250.5, reason: "TOPUP" });
    expect(holder.db.balanceOf("u1")).toBe("1250.50");
    expect(String(txn.direction)).toBe("CREDIT");
    expect(txn.balanceAfter.toFixed(2)).toBe("1250.50");
    expect(holder.db.walletTxns).toHaveLength(1);
  });

  it("rejects zero and negative amounts", async () => {
    await expect(creditWallet({ userId: "u1", amount: 0, reason: "TOPUP" })).rejects.toThrow(
      LedgerError
    );
    await expect(
      creditWallet({ userId: "u1", amount: -5, reason: "TOPUP" })
    ).rejects.toThrow(LedgerError);
  });

  it("is idempotent per key — a retry does not double-credit", async () => {
    const key = "topup:abc";
    await creditWallet({ userId: "u1", amount: 100, reason: "TOPUP", idempotencyKey: key });
    const replay = await creditWallet({
      userId: "u1",
      amount: 100,
      reason: "TOPUP",
      idempotencyKey: key,
    });
    expect(holder.db.balanceOf("u1")).toBe("1100.00");
    expect(holder.db.walletTxns).toHaveLength(1);
    expect(replay.idempotencyKey).toBe(key);
  });
});

describe("debitWallet", () => {
  it("decreases the balance and snapshots balanceAfter", async () => {
    const txn = await debitWallet({ userId: "u1", amount: "999.99", reason: "TRANSACTION" });
    expect(holder.db.balanceOf("u1")).toBe("0.01");
    expect(txn.balanceAfter.toFixed(2)).toBe("0.01");
  });

  it("refuses to overspend the balance", async () => {
    await expect(
      debitWallet({ userId: "u1", amount: 1000.01, reason: "TRANSACTION" })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(holder.db.balanceOf("u1")).toBe("1000.00");
    expect(holder.db.walletTxns).toHaveLength(0);
  });

  it("respects holds — spendable is balance minus held", async () => {
    await holdFunds({ userId: "u1", amount: 600 });
    await expect(
      debitWallet({ userId: "u1", amount: 500, reason: "TRANSACTION" })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    // 400 spendable is still fine
    await debitWallet({ userId: "u1", amount: 400, reason: "TRANSACTION" });
    expect(holder.db.balanceOf("u1")).toBe("600.00");
  });

  it("is idempotent per key — a retry does not double-debit", async () => {
    const key = "txn:u1:k1:reserve";
    await debitWallet({ userId: "u1", amount: 100, reason: "TRANSACTION", idempotencyKey: key });
    await debitWallet({ userId: "u1", amount: 100, reason: "TRANSACTION", idempotencyKey: key });
    expect(holder.db.balanceOf("u1")).toBe("900.00");
    expect(holder.db.walletTxns).toHaveLength(1);
  });
});

describe("hold / release / capture lifecycle", () => {
  it("hold reserves without a passbook entry", async () => {
    await holdFunds({ userId: "u1", amount: 300 });
    expect(holder.db.balanceOf("u1")).toBe("1000.00"); // balance untouched
    expect(holder.db.heldOf("u1")).toBe("300.00");
    expect(holder.db.walletTxns).toHaveLength(0);
  });

  it("hold cannot exceed spendable", async () => {
    await holdFunds({ userId: "u1", amount: 800 });
    await expect(holdFunds({ userId: "u1", amount: 300 })).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
  });

  it("release returns held funds to spendable", async () => {
    await holdFunds({ userId: "u1", amount: 300 });
    await releaseHold({ userId: "u1", amount: 300 });
    expect(holder.db.heldOf("u1")).toBe("0.00");
    await debitWallet({ userId: "u1", amount: 1000, reason: "TRANSACTION" });
    expect(holder.db.balanceOf("u1")).toBe("0.00");
  });

  it("release cannot exceed the held amount", async () => {
    await holdFunds({ userId: "u1", amount: 100 });
    await expect(releaseHold({ userId: "u1", amount: 200 })).rejects.toMatchObject({
      code: "INSUFFICIENT_HOLD",
    });
  });

  it("capture converts the hold into a real DEBIT with a passbook row", async () => {
    await holdFunds({ userId: "u1", amount: 250 });
    const txn = await captureHold({
      userId: "u1",
      amount: 250,
      reason: "PAYOUT",
      idempotencyKey: "payout:p1:capture",
    });
    expect(holder.db.balanceOf("u1")).toBe("750.00");
    expect(holder.db.heldOf("u1")).toBe("0.00");
    expect(String(txn.direction)).toBe("DEBIT");
    expect(txn.balanceAfter.toFixed(2)).toBe("750.00");
  });

  it("capture is idempotent — webhook + poller racing settle once", async () => {
    await holdFunds({ userId: "u1", amount: 250 });
    const key = "payout:p1:capture";
    await captureHold({ userId: "u1", amount: 250, reason: "PAYOUT", idempotencyKey: key });
    await captureHold({ userId: "u1", amount: 250, reason: "PAYOUT", idempotencyKey: key });
    expect(holder.db.balanceOf("u1")).toBe("750.00");
    expect(holder.db.walletTxns).toHaveLength(1);
  });

  it("capture cannot settle more than is held", async () => {
    await holdFunds({ userId: "u1", amount: 100 });
    await expect(
      captureHold({ userId: "u1", amount: 150, reason: "PAYOUT" })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_HOLD" });
  });
});
