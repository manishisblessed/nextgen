import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { samedaySign, samedayAuthHeaders } from "@/lib/partners/sameday-core";
import { mapPay2NewBill, mapPay2NewStatus } from "@/lib/partners/sameday-bbps";
import { mapSettlementStatus } from "@/lib/partners/sameday-settlement";
import { mapSettlementToPayoutStatus } from "@/lib/partners/sameday-payout";
import { mapPgStatus } from "@/lib/partners/bulkpe";
import {
  buildCustParams,
  mapBulkpeBbpsStatus,
  mapBulkpeBill,
  normalizeBulkpeBiller,
} from "@/lib/partners/bulkpe-bbps";
import { deriveEsignStatus } from "@/lib/partners/leegality";

/**
 * Pure-function tests for the new partner adapters: the Same Day HMAC
 * signature scheme (a wrong signature = every call 401s in prod) and the
 * status/bill mapping helpers that decide whether money moved.
 */

describe("Same Day HMAC signing", () => {
  it("signs bodyString + timestamp with HMAC-SHA256 hex", () => {
    // Independent reference implementation.
    const expected = crypto
      .createHmac("sha256", "secret-1")
      .update('{"amount":100}1700000000000')
      .digest("hex");
    expect(samedaySign("secret-1", '{"amount":100}1700000000000')).toBe(expected);
  });

  it("produces verifiable auth headers for a POST body", () => {
    const body = JSON.stringify({ number: "5008", amount: 15234 });
    const h = samedayAuthHeaders("key-1", "secret-1", body);
    expect(h["x-api-key"]).toBe("key-1");
    expect(h["x-timestamp"]).toMatch(/^\d{13}$/);
    // Server-side check: HMAC(secret, compactBody + timestamp) must match.
    expect(h["x-signature"]).toBe(samedaySign("secret-1", body + h["x-timestamp"]));
  });

  it("signs the empty string for GET requests", () => {
    const h = samedayAuthHeaders("key-1", "secret-1", "");
    expect(h["x-signature"]).toBe(samedaySign("secret-1", h["x-timestamp"]));
  });
});

describe("Pay2New bill mapping", () => {
  it("maps the documented fetch-bill response", () => {
    const bill = mapPay2NewBill({
      success: true,
      data: {
        customer_name: "MANISH KUMAR SHAH",
        amount: "15234.00",
        bill_date: "2026-06-15",
        bill_due_date: "2026-07-05",
        bill_number: "INV-2026-06-001",
        "Minimum Amount Due": "1523.00",
        "Maximum Permissible Amount": "50000.00",
      },
      order_id: "P2N_ORD_1234567890",
      request_id: "SDS1719720000000",
    });
    expect(bill).toEqual({
      customerName: "MANISH KUMAR SHAH",
      amount: 15234,
      dueDate: "2026-07-05",
      billDate: "2026-06-15",
      billNumber: "INV-2026-06-001",
      minAmount: 1523,
      maxAmount: 50000,
      billFetchRef: "P2N_ORD_1234567890",
    });
  });

  it("tolerates missing optional fields", () => {
    const bill = mapPay2NewBill({ success: true, data: { amount: "100" } });
    expect(bill.amount).toBe(100);
    expect(bill.customerName).toBe("");
    expect(bill.minAmount).toBeUndefined();
    expect(bill.billFetchRef).toBeUndefined();
  });

  it("maps payment statuses, defaulting unknowns to PENDING", () => {
    expect(mapPay2NewStatus("SUCCESS")).toBe("SUCCESS");
    expect(mapPay2NewStatus("failed")).toBe("FAILED");
    expect(mapPay2NewStatus("REFUNDED")).toBe("REFUNDED");
    expect(mapPay2NewStatus("PENDING")).toBe("PENDING");
    expect(mapPay2NewStatus("SOMETHING_NEW")).toBe("PENDING");
    expect(mapPay2NewStatus(undefined)).toBe("PENDING");
  });
});

describe("Same Day settlement status mapping", () => {
  it("treats only explicit SUCCESS/FAILED as terminal", () => {
    expect(mapSettlementStatus("SUCCESS")).toBe("SUCCESS");
    expect(mapSettlementStatus("FAILED")).toBe("FAILED");
    expect(mapSettlementStatus("PENDING")).toBe("PENDING");
    expect(mapSettlementStatus("PROCESSING")).toBe("PENDING");
    expect(mapSettlementStatus(undefined)).toBe("PENDING");
  });
});

describe("Same Day settlement → payout status mapping", () => {
  it("maps terminal states and keeps PENDING in-flight", () => {
    expect(mapSettlementToPayoutStatus("SUCCESS")).toBe("PAID");
    expect(mapSettlementToPayoutStatus("FAILED")).toBe("FAILED");
    expect(mapSettlementToPayoutStatus("PENDING")).toBe("PROCESSING");
  });
});

describe("BulkPe Simple PG status mapping", () => {
  it("maps paid variants to PAID", () => {
    expect(mapPgStatus("SUCCESS")).toBe("PAID");
    expect(mapPgStatus("paid")).toBe("PAID");
    expect(mapPgStatus("COMPLETED")).toBe("PAID");
  });
  it("maps failure variants to FAILED and expiry to EXPIRED", () => {
    expect(mapPgStatus("FAILED")).toBe("FAILED");
    expect(mapPgStatus("CANCELLED")).toBe("FAILED");
    expect(mapPgStatus("EXPIRED")).toBe("EXPIRED");
  });
  it("treats pending/unknown as CREATED (non-terminal — never credit on it)", () => {
    expect(mapPgStatus("PENDING")).toBe("CREATED");
    expect(mapPgStatus("INITIATED")).toBe("CREATED");
    expect(mapPgStatus(undefined)).toBe("CREATED");
  });
});

describe("BulkPe BBPS mapping", () => {
  it("un-swaps selectBiller's billerId/billerName fields", () => {
    // Documented response has the BBPS code under `billerName`.
    const b = normalizeBulkpeBiller(
      {
        category: "DTH",
        billerId: "Airtel DTH",
        billerName: "AIRT00000NAT87",
        customerparams: [{ paramName: "Customer Id", dataType: "NUMERIC", optional: false }],
      },
      "BROADBAND"
    );
    expect(b.code).toBe("AIRT00000NAT87");
    expect(b.name).toBe("Airtel DTH");
    expect(b.params).toEqual([{ name: "Customer Id", dataType: "NUMERIC", optional: false }]);
  });

  it("keeps the fields as-is when billerId already holds the code", () => {
    const b = normalizeBulkpeBiller(
      { billerId: "ICIC00000NATSI", billerName: "ICICI Credit card" },
      "CREDIT_CARD"
    );
    expect(b.code).toBe("ICIC00000NATSI");
    expect(b.name).toBe("ICICI Credit card");
  });

  it("maps the documented FetchBillSingle response", () => {
    const bill = mapBulkpeBill({
      fetchId: "REF00014",
      reference: "test09",
      billerId: "ICIC00000NATSI",
      category: "Credit Card",
      minAmount: 100,
      amount: "99999",
      status: "SUCCESS",
      billDetails: {
        customerName: "Steve Jobs",
        amount: "99999",
        dueDate: "2024-11-15",
        billDate: "2024-10-28",
        billNumber: null,
      },
      additionalData: {
        tag: [
          { name: "Minimum Amount Due", value: "7810.00" },
          { name: "Current Outstanding Amount", value: "77798.63" },
        ],
      },
    });
    expect(bill).toEqual({
      customerName: "Steve Jobs",
      amount: 99999,
      dueDate: "2024-11-15",
      billDate: "2024-10-28",
      billNumber: undefined,
      minAmount: 100,
      billFetchRef: "REF00014",
    });
  });

  it("falls back to the Minimum Amount Due tag when minAmount is absent", () => {
    const bill = mapBulkpeBill({
      fetchId: "REF1",
      amount: "500",
      additionalData: { tag: [{ name: "Minimum Amount Due", value: "50.00" }] },
    });
    expect(bill.amount).toBe(500);
    expect(bill.minAmount).toBe(50);
  });

  it("maps payment statuses, defaulting unknowns to PENDING", () => {
    expect(mapBulkpeBbpsStatus("SUCCESS")).toBe("SUCCESS");
    expect(mapBulkpeBbpsStatus("failed")).toBe("FAILED");
    expect(mapBulkpeBbpsStatus("REVERSED")).toBe("REFUNDED");
    expect(mapBulkpeBbpsStatus("PENDING")).toBe("PENDING");
    expect(mapBulkpeBbpsStatus("SOMETHING_NEW")).toBe("PENDING");
    expect(mapBulkpeBbpsStatus(undefined)).toBe("PENDING");
  });

  it("builds custParam from generic keys, translating known CC aliases", () => {
    expect(
      buildCustParams({
        cardLast4: "1007",
        mobile: "9999922222",
        billFetchRef: "REF00014", // reserved — never sent to the biller
      })
    ).toEqual([
      { name: "Last 4 digits of Credit Card Number", value: "1007" },
      { name: "Registered Mobile Number", value: "9999922222" },
    ]);
  });

  it("passes unknown biller param names straight through and drops empties", () => {
    expect(buildCustParams({ "Consumer ID": "200123456789", udf: "" })).toEqual([
      { name: "Consumer ID", value: "200123456789" },
    ]);
  });
});

describe("Leegality document status derivation", () => {
  it("is COMPLETED only when every invitee signed", () => {
    expect(
      deriveEsignStatus({ invitations: [{ signed: true }, { signed: true }] })
    ).toBe("COMPLETED");
    expect(
      deriveEsignStatus({ invitations: [{ signed: true }, { signed: false }] })
    ).toBe("PARTIALLY_SIGNED");
  });

  it("flags expiry and deletion", () => {
    expect(
      deriveEsignStatus({ requests: [{ expired: true }], invitations: [{ signed: false }] })
    ).toBe("EXPIRED");
    expect(
      deriveEsignStatus({ requests: [{ deleted: true }], invitations: [{ signed: true }] })
    ).toBe("DELETED");
  });

  it("defaults to PENDING with no signatures", () => {
    expect(deriveEsignStatus({ invitations: [{ signed: false }] })).toBe("PENDING");
    expect(deriveEsignStatus({})).toBe("PENDING");
  });
});
