import { describe, expect, it, vi } from "vitest";

/**
 * Phase 3 (agent experience) — pure logic tests:
 *  - dispute SLA computation & escalation ladder
 *  - settlement autosweep decisioning (never sweeps frozen/dust/float)
 *  - wallet statement CSV rendering (RFC-4180 escaping, totals)
 *  - financial-year windows for the commission certificate
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendOpsAlert: vi.fn() }));
vi.mock("@/lib/partners/sameday-settlement", () => ({
  samedaySettlementConfigured: () => false,
  settlementBalance: vi.fn(),
  settlementListAccounts: vi.fn(),
  settlementTransfer: vi.fn(),
}));

import { computeSlaDueAt, escalate, SLA_HOURS } from "@/lib/disputes/service";
import { computeSweepAmount, istDateKey } from "@/lib/settlement/autosweep";
import { buildStatementCsv, csvCell, pdfSafe, type StatementData } from "@/lib/statements/walletStatement";
import { fyStartYearOf, fyWindow } from "@/lib/statements/commissionCertificate";

describe("dispute SLA", () => {
  it("computes the due time from priority", () => {
    const from = new Date("2026-07-01T10:00:00Z");
    expect(computeSlaDueAt("URGENT", from).getTime()).toBe(from.getTime() + 4 * 3600_000);
    expect(computeSlaDueAt("NORMAL", from).getTime()).toBe(from.getTime() + 48 * 3600_000);
    expect(computeSlaDueAt("LOW", from).getTime()).toBe(from.getTime() + 72 * 3600_000);
  });

  it("escalates one level and saturates at URGENT", () => {
    expect(escalate("LOW")).toBe("NORMAL");
    expect(escalate("NORMAL")).toBe("HIGH");
    expect(escalate("HIGH")).toBe("URGENT");
    expect(escalate("URGENT")).toBe("URGENT");
  });

  it("keeps the SLA ladder strictly tighter as priority rises", () => {
    expect(SLA_HOURS.URGENT).toBeLessThan(SLA_HOURS.HIGH);
    expect(SLA_HOURS.HIGH).toBeLessThan(SLA_HOURS.NORMAL);
    expect(SLA_HOURS.NORMAL).toBeLessThan(SLA_HOURS.LOW);
  });
});

describe("settlement autosweep decision", () => {
  const base = { keepBalance: 10000, minTransfer: 1000, isFrozen: false };

  it("never sweeps a frozen wallet", () => {
    expect(computeSweepAmount({ ...base, balance: 100000, isFrozen: true })).toEqual({
      sweep: false,
      reason: "partner wallet is frozen",
    });
  });

  it("keeps the configured float untouched", () => {
    expect(computeSweepAmount({ ...base, balance: 9000 }).sweep).toBe(false);
    expect(computeSweepAmount({ ...base, balance: 10000 }).sweep).toBe(false);
  });

  it("skips dust below the minimum transfer", () => {
    expect(computeSweepAmount({ ...base, balance: 10999 }).sweep).toBe(false);
  });

  it("sweeps the whole-rupee surplus above the float", () => {
    expect(computeSweepAmount({ ...base, balance: 25500.75 })).toEqual({ sweep: true, amount: 15500 });
  });

  it("renders the idempotency key as an IST calendar date", () => {
    // 20:00 UTC = 01:30 IST next day — the sweep key must follow IST.
    expect(istDateKey(new Date("2026-07-01T20:00:00Z"))).toBe("2026-07-02");
    expect(istDateKey(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01");
  });
});

describe("wallet statement CSV", () => {
  it("sanitizes non-WinAnsi characters so pdf-lib never throws", () => {
    expect(pdfSafe("₹500 — recharge")).toBe("Rs 500 - recharge");
    expect(pdfSafe("टॉप-अप")).toBe("???-??");
    expect(pdfSafe("plain ASCII 123")).toBe("plain ASCII 123");
  });

  it("escapes commas and quotes per RFC 4180", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
  });

  it("renders opening/closing balances, rows and totals", () => {
    const data: StatementData = {
      accountName: "Asha Retail",
      accountPhone: "9876543210",
      role: "RETAILER",
      from: new Date("2026-06-01T00:00:00+05:30"),
      to: new Date("2026-06-30T23:59:59+05:30"),
      openingBalance: 1000,
      closingBalance: 1450.5,
      totalCredits: 700.5,
      totalDebits: 250,
      rows: [
        {
          date: new Date("2026-06-05T12:00:00+05:30"),
          description: "Wallet top-up",
          ref: "TOPUP1",
          debit: null,
          credit: 700.5,
          balanceAfter: 1700.5,
        },
        {
          date: new Date("2026-06-10T12:00:00+05:30"),
          description: "Service transaction — BBPS, credit card",
          ref: "TXN1",
          debit: 250,
          credit: null,
          balanceAfter: 1450.5,
        },
      ],
    };
    const csv = buildStatementCsv(data);
    expect(csv).toContain("Opening balance,1000.00");
    expect(csv).toContain("Closing balance,1450.50");
    expect(csv).toContain("Date,Description,Reference,Debit,Credit,Balance");
    expect(csv).toContain('"Service transaction — BBPS, credit card"');
    expect(csv).toContain("Totals,,,250.00,700.50,");
  });
});

describe("financial-year windows", () => {
  it("builds an April–March window with the right label", () => {
    const { from, to, label } = fyWindow(2025);
    expect(label).toBe("FY 2025-26");
    expect(from.toISOString()).toBe(new Date("2025-04-01T00:00:00+05:30").toISOString());
    expect(to.toISOString()).toBe(new Date("2026-03-31T23:59:59.999+05:30").toISOString());
  });

  it("maps dates to the FY they belong to (IST)", () => {
    expect(fyStartYearOf(new Date("2026-03-31T12:00:00+05:30"))).toBe(2025);
    expect(fyStartYearOf(new Date("2026-04-01T12:00:00+05:30"))).toBe(2026);
    expect(fyStartYearOf(new Date("2026-07-02T00:00:00+05:30"))).toBe(2026);
  });
});
