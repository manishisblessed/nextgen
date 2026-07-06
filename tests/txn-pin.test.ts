import { describe, expect, it } from "vitest";
import { isWeakPin, readTxnPin, TXN_PIN_RE } from "@/lib/security/txnPin";

/**
 * Pure-function tests for the transaction-PIN module: format rules, the
 * weak-PIN rejector, and the header-only transport (the PIN must NEVER be
 * accepted from a JSON body, where it could leak into persisted request
 * snapshots).
 */

describe("transaction PIN format", () => {
  it("accepts 4 to 6 digits only", () => {
    expect(TXN_PIN_RE.test("4821")).toBe(true);
    expect(TXN_PIN_RE.test("48215")).toBe(true);
    expect(TXN_PIN_RE.test("482159")).toBe(true);
    expect(TXN_PIN_RE.test("482")).toBe(false);
    expect(TXN_PIN_RE.test("4821590")).toBe(false);
    expect(TXN_PIN_RE.test("48a1")).toBe(false);
    expect(TXN_PIN_RE.test("")).toBe(false);
  });
});

describe("weak PIN rejection", () => {
  it("rejects repeated digits", () => {
    expect(isWeakPin("0000")).toBe(true);
    expect(isWeakPin("1111")).toBe(true);
    expect(isWeakPin("999999")).toBe(true);
  });

  it("rejects ascending and descending runs", () => {
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("4321")).toBe(true);
    expect(isWeakPin("456789")).toBe(true);
    expect(isWeakPin("9876")).toBe(true);
  });

  it("accepts ordinary PINs", () => {
    expect(isWeakPin("4821")).toBe(false);
    expect(isWeakPin("1357")).toBe(false);
    expect(isWeakPin("2090")).toBe(false);
  });
});

describe("PIN transport", () => {
  it("reads the PIN from the x-txn-pin header", () => {
    const req = new Request("http://localhost/api/pay", {
      method: "POST",
      headers: { "x-txn-pin": " 4821 " },
    });
    expect(readTxnPin(req)).toBe("4821");
  });

  it("returns undefined when the header is absent or empty", () => {
    expect(readTxnPin(new Request("http://localhost/api/pay"))).toBeUndefined();
    expect(
      readTxnPin(new Request("http://localhost/api/pay", { headers: { "x-txn-pin": "" } }))
    ).toBeUndefined();
  });
});
