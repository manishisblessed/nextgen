import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  evaluateAmlPatterns,
  istDateKey,
  istDayStartUtc,
  DEFAULT_AML_LIMITS,
  type AmlMovement,
} from "@/lib/aml/engine";
import { hashAuditRow, computeRootHash, chainHashOf } from "@/lib/audit/anchor";
import { productionSecretIssues } from "@/lib/env";

/**
 * Phase 5 (compliance maturity) tests. The AML rules decide what lands in
 * front of the compliance officer — false negatives are regulatory exposure,
 * so each rule's boundary is pinned. The audit-anchor hashing is the tamper
 * detector: any change to its canonicalization silently invalidates every
 * historical anchor, so the exact scheme is locked by test vectors.
 */

const limits = DEFAULT_AML_LIMITS;

function mv(amount: number, ref = `R${amount}`): AmlMovement {
  return { amount, ref, kind: "TXN" };
}

describe("AML rule evaluation", () => {
  it("flags a single movement at/above the CTR threshold", () => {
    const findings = evaluateAmlPatterns({ movements: [mv(1_000_000)], wasDormant: false, limits });
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain("HIGH_VALUE");
    expect(rules).toContain("AGG_DAILY_VOLUME"); // single ≥ line implies aggregate too
  });

  it("stays silent below every threshold", () => {
    const findings = evaluateAmlPatterns({
      movements: [mv(20_000), mv(30_000)],
      wasDormant: false,
      limits,
    });
    expect(findings).toEqual([]);
  });

  it("flags aggregate daily volume crossing the CTR line without any single high-value txn", () => {
    const movements = Array.from({ length: 5 }, (_, i) => mv(210_000, `R${i}`));
    const findings = evaluateAmlPatterns({ movements, wasDormant: false, limits });
    expect(findings.map((f) => f.rule)).toEqual(["AGG_DAILY_VOLUME"]);
  });

  it("detects structuring: 3+ movements just below the ₹50k line", () => {
    const findings = evaluateAmlPatterns({
      movements: [mv(49_500), mv(49_900), mv(45_000), mv(10_000)],
      wasDormant: false,
      limits,
    });
    const s = findings.find((f) => f.rule === "STRUCTURING");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("HIGH");
    expect((s!.details as { count: number }).count).toBe(3);
  });

  it("does NOT flag structuring when movements are at/above the line or far below the band", () => {
    const findings = evaluateAmlPatterns({
      movements: [mv(50_000), mv(50_000), mv(50_000), mv(44_999)],
      wasDormant: false,
      limits,
    });
    expect(findings.find((f) => f.rule === "STRUCTURING")).toBeUndefined();
  });

  it("flags a dormant account bursting past the threshold — but not an active one", () => {
    const movements = [mv(150_000), mv(60_000)];
    const dormant = evaluateAmlPatterns({ movements, wasDormant: true, limits });
    expect(dormant.map((f) => f.rule)).toContain("DORMANT_BURST");
    expect(dormant.find((f) => f.rule === "DORMANT_BURST")!.severity).toBe("MEDIUM");

    const active = evaluateAmlPatterns({ movements, wasDormant: false, limits });
    expect(active.find((f) => f.rule === "DORMANT_BURST")).toBeUndefined();
  });
});

describe("IST day bucketing", () => {
  it("assigns a late-UTC evening to the next IST day", () => {
    // 2026-07-01 20:00 UTC = 2026-07-02 01:30 IST
    expect(istDateKey(new Date("2026-07-01T20:00:00Z"))).toBe("2026-07-02");
    expect(istDateKey(new Date("2026-07-01T18:29:59Z"))).toBe("2026-07-01");
  });

  it("round-trips: the day start converts back to the same key", () => {
    const start = istDayStartUtc("2026-07-02");
    expect(start.toISOString()).toBe("2026-07-01T18:30:00.000Z");
    expect(istDateKey(start)).toBe("2026-07-02");
  });
});

describe("audit hash chain", () => {
  const row = {
    id: "log1",
    userId: "u1",
    action: "payout.submitted",
    entity: "PayoutRequest",
    entityId: "p1",
    createdAt: new Date("2026-07-01T10:00:00Z"),
  };

  it("hashes a row canonically (pipe-joined fields, sha256 hex)", () => {
    const expected = crypto
      .createHash("sha256")
      .update("log1|u1|payout.submitted|PayoutRequest|p1|2026-07-01T10:00:00.000Z")
      .digest("hex");
    expect(hashAuditRow(row)).toBe(expected);
  });

  it("any field change breaks the row hash", () => {
    const tampered = { ...row, action: "payout.approved" };
    expect(hashAuditRow(tampered)).not.toBe(hashAuditRow(row));
  });

  it("root hash depends on row order (reordering = tampering)", () => {
    const h1 = hashAuditRow(row);
    const h2 = hashAuditRow({ ...row, id: "log2" });
    expect(computeRootHash([h1, h2])).not.toBe(computeRootHash([h2, h1]));
  });

  it("chains anchors so rewriting one day invalidates the next", () => {
    const day1Root = computeRootHash([hashAuditRow(row)]);
    const day1Chain = chainHashOf("", day1Root);
    const day2Root = computeRootHash([hashAuditRow({ ...row, id: "log2" })]);
    const day2Chain = chainHashOf(day1Chain, day2Root);

    // Tamper with day 1 → its chain hash changes → day 2 no longer verifies.
    const tamperedDay1Chain = chainHashOf("", computeRootHash([hashAuditRow({ ...row, userId: "u2" })]));
    expect(chainHashOf(tamperedDay1Chain, day2Root)).not.toBe(day2Chain);
  });
});

describe("secrets hardening", () => {
  it("returns no issues outside production", () => {
    // Vitest runs with NODE_ENV=test — the check must be a no-op.
    expect(productionSecretIssues()).toEqual([]);
  });
});
