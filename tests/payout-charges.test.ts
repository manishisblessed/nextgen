import { describe, expect, it } from "vitest";
import { GST_PERCENT, payoutServiceCharge, quotePayout } from "@/lib/payout/charges";
import { toFixedString } from "@/lib/money";

describe("payout service charge slabs", () => {
  it("IMPS slabs: ≤1000 → ₹5, ≤25000 → ₹10, above → ₹15", () => {
    expect(toFixedString(payoutServiceCharge(500, "IMPS"))).toBe("5.00");
    expect(toFixedString(payoutServiceCharge(1000, "IMPS"))).toBe("5.00"); // boundary inclusive
    expect(toFixedString(payoutServiceCharge(1000.01, "IMPS"))).toBe("10.00");
    expect(toFixedString(payoutServiceCharge(25000, "IMPS"))).toBe("10.00");
    expect(toFixedString(payoutServiceCharge(25001, "IMPS"))).toBe("15.00");
    expect(toFixedString(payoutServiceCharge(500000, "IMPS"))).toBe("15.00");
  });

  it("UPI slabs: ≤1000 → ₹3, ≤25000 → ₹6, above → ₹10", () => {
    expect(toFixedString(payoutServiceCharge(999, "UPI"))).toBe("3.00");
    expect(toFixedString(payoutServiceCharge(20000, "UPI"))).toBe("6.00");
    expect(toFixedString(payoutServiceCharge(30000, "UPI"))).toBe("10.00");
  });

  it("NEFT and RTGS slabs", () => {
    expect(toFixedString(payoutServiceCharge(5000, "NEFT"))).toBe("5.00");
    expect(toFixedString(payoutServiceCharge(50000, "NEFT"))).toBe("10.00");
    expect(toFixedString(payoutServiceCharge(200000, "RTGS"))).toBe("20.00");
  });
});

describe("quotePayout — the exact debit the user pays", () => {
  it("GST is 18% of the service charge, not of the amount", () => {
    expect(GST_PERCENT).toBe(18);
    const q = quotePayout(10000, "IMPS");
    expect(toFixedString(q.serviceCharge)).toBe("10.00");
    expect(toFixedString(q.gst)).toBe("1.80");
    expect(toFixedString(q.totalDebit)).toBe("10011.80");
  });

  it("beneficiary receives the full amount (charge is on top)", () => {
    const q = quotePayout("999.99", "UPI");
    expect(toFixedString(q.amount)).toBe("999.99");
    expect(toFixedString(q.serviceCharge)).toBe("3.00");
    expect(toFixedString(q.gst)).toBe("0.54");
    expect(toFixedString(q.totalDebit)).toBe("1003.53");
  });

  it("totalDebit always equals amount + charge + gst exactly", () => {
    for (const [amount, mode] of [
      [123.45, "IMPS"],
      [25000, "UPI"],
      [77777.77, "NEFT"],
      [400000, "RTGS"],
    ] as const) {
      const q = quotePayout(amount, mode);
      const recomputed = q.amount.add(q.serviceCharge).add(q.gst);
      expect(toFixedString(q.totalDebit)).toBe(toFixedString(recomputed));
    }
  });
});
