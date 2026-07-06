import { describe, expect, it } from "vitest";
import {
  add,
  dec,
  eq,
  gte,
  mul,
  percentOf,
  round,
  sub,
  toFixedString,
  toNumber,
} from "@/lib/money";

describe("money helpers (Decimal safety)", () => {
  it("adds without float drift (0.1 + 0.2 === 0.3)", () => {
    expect(toFixedString(add(0.1, 0.2))).toBe("0.30");
    expect(eq(add(0.1, 0.2), 0.3)).toBe(true);
  });

  it("keeps precision on large rupee values", () => {
    const big = add("99999999999.99", "0.01");
    expect(toFixedString(big)).toBe("100000000000.00");
  });

  it("subtracts exactly", () => {
    expect(toFixedString(sub("100.00", "99.99"))).toBe("0.01");
  });

  it("rounds half-up at money scale", () => {
    expect(toFixedString(round("10.005"))).toBe("10.01");
    expect(toFixedString(round("10.004"))).toBe("10.00");
  });

  it("percentOf computes GST-style percentages", () => {
    expect(toFixedString(percentOf(100, 18))).toBe("18.00");
    expect(toFixedString(percentOf(5, 18))).toBe("0.90");
    // 18% of ₹10 charge = ₹1.80
    expect(toFixedString(percentOf(10, 18))).toBe("1.80");
  });

  it("multiplication stays exact for fraction commissions", () => {
    // 0.5% commission on ₹1,23,456.78
    expect(toFixedString(round(mul("123456.78", "0.005")))).toBe("617.28");
  });

  it("comparison helpers agree with Decimal semantics", () => {
    expect(gte("100.00", 100)).toBe(true);
    expect(gte("99.99", 100)).toBe(false);
  });

  it("dec() never routes numbers through float parsing surprises", () => {
    expect(toNumber(dec(123.45))).toBe(123.45);
    expect(dec("0.1").add(dec("0.2")).toString()).toBe("0.3");
  });
});
