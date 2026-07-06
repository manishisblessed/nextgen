import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./helpers/fakeDb";

/**
 * Static-QR claim tests — the invariants under test:
 *   1. One UPI payment (UTR) settles AT MOST ONCE, platform-wide.
 *   2. One screenshot backs at most one claim.
 *   3. Money moves only on admin approval with portal attestation, exactly
 *      once, and large amounts need a second, different admin.
 */

const holder = vi.hoisted(() => ({ db: undefined as unknown as FakeDb }));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop) => (holder.db as unknown as Record<PropertyKey, unknown>)[prop] }
  ),
}));

import {
  approveQrClaim,
  clawbackQrClaim,
  precheckQrClaim,
  rejectQrClaim,
  screenshotSha256,
  submitQrClaim,
  QrClaimError,
  dailyClaimCountLimit,
} from "@/lib/qr/claims";

let utrSeq = 100_000_000_000;
const nextUtr = () => String(utrSeq++);
const hashOf = (s: string) => screenshotSha256(Buffer.from(s));

function validClaim(overrides: Partial<Parameters<typeof submitQrClaim>[0]> = {}) {
  const utr = overrides.utr ?? nextUtr();
  return {
    userId: "retailer1",
    qrId: "qr1",
    amount: 500,
    utr,
    paidAt: new Date(Date.now() - 60 * 60 * 1000), // an hour ago
    screenshotHash: overrides.screenshotHash ?? hashOf(`shot-${utr}`),
    screenshotPublicId: `cld/${utr}`,
    screenshotFormat: "jpg",
    ...overrides,
  };
}

beforeEach(() => {
  holder.db = new FakeDb();
  holder.db.addUser("retailer1", 1000);
  holder.db.addUser("retailer2", 0);
  holder.db.addStaticQr("qr1");
});

describe("submitQrClaim — validation", () => {
  it("creates a PENDING claim and moves no money", async () => {
    const claim = await submitQrClaim(validClaim());
    expect(claim.status).toBe("PENDING");
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");
    expect(holder.db.auditLogs.some((l) => l.action === "qr_claim.submitted")).toBe(true);
  });

  it("rejects malformed UTRs", async () => {
    await expect(submitQrClaim(validClaim({ utr: "12345" }))).rejects.toThrow(QrClaimError);
    await expect(submitQrClaim(validClaim({ utr: "ABCD12345678" }))).rejects.toThrow(/12-digit/);
  });

  it("normalizes spaces/hyphens in the UTR", async () => {
    const claim = await submitQrClaim(validClaim({ utr: "1234 5678-9012" }));
    expect(claim.utr).toBe("123456789012");
  });

  it("rejects future and stale paidAt", async () => {
    await expect(
      submitQrClaim(validClaim({ paidAt: new Date(Date.now() + 60 * 60 * 1000) }))
    ).rejects.toThrow(/future/);
    await expect(
      submitQrClaim(validClaim({ paidAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }))
    ).rejects.toThrow(/older/);
  });

  it("rejects claims on an unknown QR", async () => {
    await expect(submitQrClaim(validClaim({ qrId: "nope" }))).rejects.toThrow(/not found/);
  });

  it("disabled QR: accepts payments dated before the switch, refuses after", async () => {
    const disabledAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    holder.db.addStaticQr("oldqr", { active: false, disabledAt });

    const before = await submitQrClaim(
      validClaim({ qrId: "oldqr", paidAt: new Date(disabledAt.getTime() - 60 * 60 * 1000) })
    );
    expect(before.status).toBe("PENDING");

    await expect(
      submitQrClaim(validClaim({ qrId: "oldqr", paidAt: new Date(disabledAt.getTime() + 60 * 60 * 1000) }))
    ).rejects.toThrow(/disabled/);
  });
});

describe("submitQrClaim — dedupe (the anti-double-settlement core)", () => {
  it("refuses a UTR that was already claimed — even by another user", async () => {
    const utr = nextUtr();
    await submitQrClaim(validClaim({ utr }));
    await expect(
      submitQrClaim(validClaim({ utr, userId: "retailer2", screenshotHash: hashOf("other-shot") }))
    ).rejects.toThrow(/already been claimed/);
  });

  it("refuses a re-used screenshot even with a fresh UTR", async () => {
    const shot = hashOf("same-image-bytes");
    await submitQrClaim(validClaim({ screenshotHash: shot }));
    await expect(submitQrClaim(validClaim({ screenshotHash: shot }))).rejects.toThrow(/screenshot/);
  });

  it("a rejected claim still burns its UTR (no resubmit-after-reject loophole)", async () => {
    const utr = nextUtr();
    const claim = await submitQrClaim(validClaim({ utr }));
    await rejectQrClaim({ claimId: claim.id as string, adminId: "admin1", note: "fake screenshot" });
    await expect(
      submitQrClaim(validClaim({ utr, screenshotHash: hashOf("retry-shot") }))
    ).rejects.toThrow(/already been claimed/);
  });

  it("enforces the daily claim-count velocity cap", async () => {
    for (let i = 0; i < dailyClaimCountLimit(); i++) {
      await submitQrClaim(validClaim());
    }
    await expect(submitQrClaim(validClaim())).rejects.toThrow(/Daily claim limit/);
  });

  it("enforces the daily amount velocity cap", async () => {
    await expect(precheckQrClaim(validClaim({ amount: 99_000 }))).resolves.toBeTruthy();
    await submitQrClaim(validClaim({ amount: 99_000 }));
    await submitQrClaim(validClaim({ amount: 99_000 }));
    await expect(submitQrClaim(validClaim({ amount: 50_000 }))).rejects.toThrow(/amount limit/);
  });
});

describe("approveQrClaim — credit path", () => {
  it("refuses approval without the portal attestation", async () => {
    const claim = await submitQrClaim(validClaim());
    await expect(
      approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: false })
    ).rejects.toThrow(/provider portal/);
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");
  });

  it("credits the wallet exactly once on approval", async () => {
    const claim = await submitQrClaim(validClaim({ amount: 750 }));
    const r = await approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: true });
    expect(r.status).toBe("APPROVED");
    expect(holder.db.balanceOf("retailer1")).toBe("1750.00");
    expect(holder.db.walletTxns).toHaveLength(1);

    // A second approve (racing admin / retry) must not double-credit.
    await expect(
      approveQrClaim({ claimId: claim.id as string, adminId: "admin2", portalVerified: true })
    ).rejects.toThrow(/already APPROVED/);
    expect(holder.db.balanceOf("retailer1")).toBe("1750.00");
    expect(holder.db.walletTxns).toHaveLength(1);
  });

  it("stages large amounts for a second approval and moves no money yet", async () => {
    const claim = await submitQrClaim(validClaim({ amount: 50_000 }));
    const r = await approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: true });
    expect(r.status).toBe("AWAITING_SECOND_APPROVAL");
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");
    expect(holder.db.walletTxns).toHaveLength(0);
  });

  it("the same admin cannot give the second approval", async () => {
    const claim = await submitQrClaim(validClaim({ amount: 50_000 }));
    await approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: true });
    await expect(
      approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: true })
    ).rejects.toThrow(/different admin/);
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");
  });

  it("a different admin's second approval credits the wallet", async () => {
    const claim = await submitQrClaim(validClaim({ amount: 50_000 }));
    await approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: true });
    const r = await approveQrClaim({ claimId: claim.id as string, adminId: "admin2", portalVerified: true });
    expect(r.status).toBe("APPROVED");
    expect(holder.db.balanceOf("retailer1")).toBe("51000.00");
    expect(holder.db.walletTxns).toHaveLength(1);
  });
});

describe("rejectQrClaim / clawbackQrClaim", () => {
  it("rejects with a mandatory note and never credits", async () => {
    const claim = await submitQrClaim(validClaim());
    await expect(
      rejectQrClaim({ claimId: claim.id as string, adminId: "admin1", note: "  " })
    ).rejects.toThrow(/note is required/);
    const r = await rejectQrClaim({ claimId: claim.id as string, adminId: "admin1", note: "UTR not in portal" });
    expect(r.status).toBe("REJECTED");
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");

    // Terminal: cannot be approved afterwards.
    await expect(
      approveQrClaim({ claimId: claim.id as string, adminId: "admin2", portalVerified: true })
    ).rejects.toThrow(/already REJECTED/);
  });

  it("claws back an approved claim exactly once", async () => {
    const claim = await submitQrClaim(validClaim({ amount: 400 }));
    await approveQrClaim({ claimId: claim.id as string, adminId: "admin1", portalVerified: true });
    expect(holder.db.balanceOf("retailer1")).toBe("1400.00");

    const r = await clawbackQrClaim({ claimId: claim.id as string, adminId: "admin1", note: "never settled by provider" });
    expect(r.status).toBe("CLAWED_BACK");
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");

    await expect(
      clawbackQrClaim({ claimId: claim.id as string, adminId: "admin1", note: "again" })
    ).rejects.toThrow(/Only approved/);
    expect(holder.db.balanceOf("retailer1")).toBe("1000.00");
  });
});
