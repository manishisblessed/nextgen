import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./helpers/fakeDb";

/**
 * Account status gate — login + money movement require ACTIVE.
 * Network-tier users stay PENDING_KYC until admin approval; SUSPENDED/CLOSED
 * are hard-blocked. The block fires BEFORE funds are reserved.
 */

const holder = vi.hoisted(() => ({ db: undefined as unknown as FakeDb }));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop) => (holder.db as unknown as Record<PropertyKey, unknown>)[prop] }
  ),
}));

import {
  assertAccountActive,
  AccountSuspendedError,
  AccountPendingApprovalError,
  getLoginBlock,
  isLoginAllowed,
} from "@/lib/security/accountGate";
import { runTransaction } from "@/lib/services/transaction";
import type { PartnerResult } from "@/lib/partners/types";

beforeEach(() => {
  holder.db = new FakeDb();
  process.env.RISK_RULES_ENABLED = "false";
});

describe("getLoginBlock / isLoginAllowed", () => {
  it("allows only ACTIVE", () => {
    expect(isLoginAllowed("ACTIVE")).toBe(true);
    expect(getLoginBlock("ACTIVE")).toBeNull();
    expect(isLoginAllowed("PENDING_KYC")).toBe(false);
    expect(getLoginBlock("PENDING_KYC")?.code).toBe("ACCOUNT_PENDING_APPROVAL");
    expect(getLoginBlock("SUSPENDED")?.code).toBe("ACCOUNT_SUSPENDED");
    expect(getLoginBlock("CLOSED")?.code).toBe("ACCOUNT_CLOSED");
  });
});

describe("assertAccountActive", () => {
  it("passes for an ACTIVE account", async () => {
    holder.db.addUser("u1", 500);
    await expect(assertAccountActive("u1")).resolves.toBeUndefined();
  });

  it("throws AccountPendingApprovalError for PENDING_KYC", async () => {
    holder.db.addUser("u1", 0, 0, "PENDING_KYC");
    await expect(assertAccountActive("u1")).rejects.toThrow(AccountPendingApprovalError);
  });

  it("throws AccountSuspendedError for a SUSPENDED account", async () => {
    holder.db.addUser("u1", 500, 0, "SUSPENDED");
    await expect(assertAccountActive("u1")).rejects.toThrow(AccountSuspendedError);
  });

  it("throws for a CLOSED account", async () => {
    holder.db.addUser("u1", 500, 0, "CLOSED");
    await expect(assertAccountActive("u1")).rejects.toThrow(AccountSuspendedError);
  });
});

describe("runTransaction under suspension", () => {
  const input = (call = vi.fn(async (): Promise<PartnerResult<{ ref: string }>> => ({
    ok: true,
    data: { ref: "OP1" },
  }))) => ({
    userId: "u1",
    service: "RECHARGE_MOBILE" as const,
    amount: 100,
    idempotencyKey: "key-suspended",
    partner: "MOCK",
    request: {},
    call,
  });

  it("blocks a suspended user before any money moves", async () => {
    holder.db.addUser("u1", 1000, 0, "SUSPENDED");
    const call = vi.fn();
    await expect(runTransaction(input(call as never))).rejects.toThrow(AccountSuspendedError);
    expect(call).not.toHaveBeenCalled();
    expect(holder.db.balanceOf("u1")).toBe("1000.00");
    expect(holder.db.walletTxns).toHaveLength(0);
    expect(holder.db.transactions).toHaveLength(0);
  });

  it("blocks PENDING_KYC before any money moves", async () => {
    holder.db.addUser("u1", 1000, 0, "PENDING_KYC");
    const call = vi.fn();
    await expect(runTransaction(input(call as never))).rejects.toThrow(AccountPendingApprovalError);
    expect(call).not.toHaveBeenCalled();
    expect(holder.db.balanceOf("u1")).toBe("1000.00");
  });

  it("lets the same user transact again after reactivation", async () => {
    holder.db.addUser("u1", 1000, 0, "SUSPENDED");
    await expect(runTransaction(input())).rejects.toThrow(AccountSuspendedError);

    holder.db.setUserStatus("u1", "ACTIVE");
    const result = await runTransaction(input());
    expect(result.status).toBe("SUCCESS");
    expect(holder.db.balanceOf("u1")).toBe("900.00");
  });
});
