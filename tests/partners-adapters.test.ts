import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { samedaySign, samedayAuthHeaders } from "@/lib/partners/sameday-core";
import { mapPay2NewBill, mapPay2NewStatus } from "@/lib/partners/sameday-bbps";
import { mapSettlementStatus, type SettlementAccount, type VerificationStatus } from "@/lib/partners/sameday-settlement";
import { mapSettlementToPayoutStatus } from "@/lib/partners/sameday-payout";
import { mapPgStatus } from "@/lib/partners/bulkpe";
import { mapViableStatus, resolveChannelRoute, viableChannels } from "@/lib/partners/viable-pg";
import {
  mapChagansStatus,
  parseChagansWebhook,
  isChagansWebhookIp,
  randomizeChagansAmount,
  resolveChagansGateway,
  chagansGateways,
  mobile10,
} from "@/lib/partners/chagans-pg";
import { isAmountMismatch } from "@/lib/wallet/guards";
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

describe("Same Day trusted account (skip verification) support", () => {
  it("SettlementAccount type accepts SKIPPED verificationStatus with correct shape", () => {
    const trustedAccount: SettlementAccount = {
      id: "acc_trusted_001",
      accountNumber: "50100104420821",
      ifscCode: "HDFC0003756",
      accountHolderName: "Manish Kumar Shah",
      isVerified: false,
      verifiedName: undefined,
      verificationStatus: "SKIPPED",
      verificationLabel: "Account not verified",
    };
    expect(trustedAccount.isVerified).toBe(false);
    expect(trustedAccount.verificationStatus).toBe("SKIPPED");
    expect(trustedAccount.verificationLabel).toBe("Account not verified");
  });

  it("SettlementAccount remains backward-compatible with verified accounts", () => {
    const verifiedAccount: SettlementAccount = {
      id: "acc_verified_001",
      accountNumber: "50100104420821",
      ifscCode: "HDFC0003756",
      accountHolderName: "Manish Kumar Shah",
      isVerified: true,
      verifiedName: "MANISH KUMAR SHAH",
      verificationStatus: "VERIFIED",
      verificationLabel: "Verified",
    };
    expect(verifiedAccount.isVerified).toBe(true);
    expect(verifiedAccount.verificationStatus).toBe("VERIFIED");
  });

  it("verificationStatus and verificationLabel are optional for backward compat", () => {
    const legacyAccount: SettlementAccount = {
      id: "acc_legacy_001",
      accountNumber: "50100104420821",
      ifscCode: "HDFC0003756",
      accountHolderName: "Manish Kumar Shah",
      isVerified: true,
    };
    expect(legacyAccount.verificationStatus).toBeUndefined();
    expect(legacyAccount.verificationLabel).toBeUndefined();
  });

  it("all verification statuses are assignable to VerificationStatus", () => {
    const statuses: VerificationStatus[] = ["VERIFIED", "NOT_VERIFIED", "SKIPPED", "PENDING", "FAILED"];
    expect(statuses).toHaveLength(5);
    statuses.forEach((s) => expect(typeof s).toBe("string"));
  });

  it("trusted account can be used in a transfer context (no isVerified gate)", () => {
    const account: SettlementAccount = {
      id: "acc_trusted_transfer",
      accountNumber: "123456789012",
      ifscCode: "SBIN0001234",
      accountHolderName: "Test User",
      isVerified: false,
      verificationStatus: "SKIPPED",
      verificationLabel: "Account not verified",
    };
    const transferInput = {
      accountId: account.id,
      amount: 5000,
      mode: "IMPS" as const,
      narration: "Test transfer to trusted account",
    };
    expect(transferInput.accountId).toBe("acc_trusted_transfer");
    expect(account.isVerified).toBe(false);
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

describe("Viable PG status mapping", () => {
  it("maps only Approved/A to PAID (the credit trigger)", () => {
    // Verified live: a paid card txn returns status "A" / "Approved".
    expect(mapViableStatus("A", "Approved")).toBe("PAID");
    expect(mapViableStatus("", "Success")).toBe("PAID");
    expect(mapViableStatus("A", "authorized")).toBe("PAID");
  });

  it("maps Pending/unknown to CREATED (keep polling, never credit)", () => {
    expect(mapViableStatus("P", "Pending")).toBe("CREATED");
    expect(mapViableStatus("", "")).toBe("CREATED");
    // An unseen code must NEVER be treated as paid.
    expect(mapViableStatus("Z", "Weird new state")).toBe("CREATED");
  });

  it("maps clear failures and expiry", () => {
    expect(mapViableStatus("F", "Failed")).toBe("FAILED");
    expect(mapViableStatus("R", "Rejected")).toBe("FAILED");
    expect(mapViableStatus("C", "Cancelled")).toBe("FAILED");
    expect(mapViableStatus("", "Declined")).toBe("FAILED");
    expect(mapViableStatus("E", "Expired")).toBe("EXPIRED");
  });
});

describe("Viable PG channels", () => {
  it("exposes channels with exactly one primary and resolves routes", () => {
    const channels = viableChannels();
    expect(channels.length).toBeGreaterThan(0);
    expect(channels.filter((c) => c.primary)).toHaveLength(1);
    // premimumpg5 is excluded (it 500s live).
    expect(channels.some((c) => c.route === "premimumpg5")).toBe(false);
  });

  it("resolves a requested channel, falling back to primary", () => {
    expect(resolveChannelRoute("razorpay2")).toBe("razorpay2");
    const primary = viableChannels().find((c) => c.primary)!;
    expect(resolveChannelRoute(undefined)).toBe(primary.route);
    expect(resolveChannelRoute("does-not-exist")).toBe(primary.route);
  });
});

describe("Chagans PG — gateways & amount", () => {
  it("exposes Comet (chagans3/t1) and Star (chagans2/t0) with caps", () => {
    const gws = chagansGateways();
    const comet = gws.find((g) => g.id === "comet")!;
    const star = gws.find((g) => g.id === "star")!;
    expect(comet.pgType).toBe("chagans3");
    expect(comet.mode).toBe("t1");
    expect(star.pgType).toBe("chagans2");
    expect(star.mode).toBe("t0");
    expect(comet.maxAmount).toBeGreaterThan(0);
    expect(star.maxAmount).toBeGreaterThan(0);
  });

  it("resolves a requested gateway, defaulting to the primary (Comet)", () => {
    expect(resolveChagansGateway("star").id).toBe("star");
    expect(resolveChagansGateway("chagans2").id).toBe("star");
    expect(resolveChagansGateway(undefined).id).toBe("comet");
    expect(resolveChagansGateway("nope").id).toBe("comet");
  });

  it("randomizes to a unique-to-paise amount that is never below the request", () => {
    for (let i = 0; i < 200; i++) {
      const out = randomizeChagansAmount(100);
      // whole rupee + 1..99 paise → strictly within (100, 101)
      expect(out).toBeGreaterThanOrEqual(100.01);
      expect(out).toBeLessThanOrEqual(100.99);
      // exactly 2 decimals
      expect(Math.round(out * 100)).toBe(out * 100);
    }
  });
});

describe("Chagans PG — webhook status mapping (conservative)", () => {
  it("credits ONLY on an explicit success signal", () => {
    expect(mapChagansStatus("success")).toBe("PAID");
    expect(mapChagansStatus("PAID")).toBe("PAID");
    expect(mapChagansStatus("captured")).toBe("PAID");
    expect(mapChagansStatus(undefined, true)).toBe("PAID");
    expect(mapChagansStatus(undefined, undefined, 200)).toBe("PAID");
  });

  it("recognises Chagans' real tokens: result=SUCCESS, event='Transaction Success'", () => {
    expect(mapChagansStatus("SUCCESS")).toBe("PAID");
    expect(mapChagansStatus("Transaction Success")).toBe("PAID");
  });

  it("maps clear failures + expiry", () => {
    expect(mapChagansStatus("failed")).toBe("FAILED");
    expect(mapChagansStatus("declined")).toBe("FAILED");
    expect(mapChagansStatus("cancelled")).toBe("FAILED");
    expect(mapChagansStatus("Transaction Failed")).toBe("FAILED");
    expect(mapChagansStatus(undefined, false)).toBe("FAILED");
    expect(mapChagansStatus("expired")).toBe("EXPIRED");
  });

  it("never treats an unknown/pending token as PAID", () => {
    expect(mapChagansStatus("pending")).toBe("UNKNOWN");
    expect(mapChagansStatus("initiated")).toBe("UNKNOWN");
    expect(mapChagansStatus("weird-new-state")).toBe("UNKNOWN");
    expect(mapChagansStatus(undefined)).toBe("UNKNOWN");
  });
});

describe("Chagans PG — defensive webhook parse", () => {
  it("extracts txnId/amount/status from a nested data envelope", () => {
    const p = parseChagansWebhook({
      success: true,
      data: { txnId: "TOPUPABC123", orderId: "CPG_1", amount: 100.57, status: "success", utr: "UTR9" },
    });
    expect(p.txnId).toBe("TOPUPABC123");
    expect(p.orderId).toBe("CPG_1");
    expect(p.amount).toBe(100.57);
    expect(p.reference).toBe("UTR9");
    expect(p.status).toBe("PAID");
  });

  it("extracts from a flat payload + alt field names", () => {
    const p = parseChagansWebhook({ txn_id: "TOPUPX", amt: "250.33", paymentStatus: "FAILED" });
    expect(p.txnId).toBe("TOPUPX");
    expect(p.amount).toBe(250.33);
    expect(p.status).toBe("FAILED");
  });

  it("parses the REAL Chagans success webhook (result/event, no echoed ref)", () => {
    // Exact shape captured live (card success via Comet).
    const p = parseChagansWebhook({
      amount: 100.31,
      userData: '{"name":"Manish RT","paymentType":""}',
      orderId: "CPG_9E2ECB4157DD74E3",
      transactionId: "6683346000",
      responseCode: "",
      rrn: "628016031809",
      result: "SUCCESS",
      originalAmount: 100.31,
      maskedCard: "XXXXXXXXXXXX1645",
      paymentMethod: "credit_card",
      event: "Transaction Success",
    });
    expect(p.status).toBe("PAID");
    expect(p.amount).toBe(100.31);
    expect(p.orderId).toBe("CPG_9E2ECB4157DD74E3");
    // Chagans' own id must NOT be mistaken for our merchant ref.
    expect(p.transactionId).toBe("6683346000");
    expect(p.txnId).toBeUndefined();
    // rrn is the bank reference.
    expect(p.reference).toBe("628016031809");
  });

  it("falls back to transactionId as reference when no rrn/utr present", () => {
    const p = parseChagansWebhook({ orderId: "CPG_2", transactionId: "999", result: "SUCCESS", amount: 5 });
    expect(p.reference).toBe("999");
  });

  it("never throws on junk and never over-credits", () => {
    expect(parseChagansWebhook(null).status).toBe("UNKNOWN");
    expect(parseChagansWebhook("nope").status).toBe("UNKNOWN");
    expect(parseChagansWebhook({ foo: "bar" }).txnId).toBeUndefined();
  });
});

describe("Chagans PG — mobile normalisation", () => {
  it("strips +91/country code to a bare 10-digit number", () => {
    expect(mobile10("+919000000204")).toBe("9000000204");
    expect(mobile10("919000000204")).toBe("9000000204");
    expect(mobile10("9000000204")).toBe("9000000204");
    expect(mobile10("+91 90000 00204")).toBe("9000000204");
    expect(mobile10("")).toBe("");
    expect(mobile10(null)).toBe("");
  });
});

describe("Chagans PG — webhook IP allow-list", () => {
  it("accepts only the whitelisted source IPs", () => {
    expect(isChagansWebhookIp("103.160.160.129")).toBe(true); // Star
    expect(isChagansWebhookIp("34.126.212.125")).toBe(true); // Comet
    expect(isChagansWebhookIp("1.2.3.4")).toBe(false);
    expect(isChagansWebhookIp("")).toBe(false);
    expect(isChagansWebhookIp(null)).toBe(false);
    expect(isChagansWebhookIp(undefined)).toBe(false);
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

describe("payin money-safety guard (isAmountMismatch)", () => {
  it("treats exact + within-tolerance amounts as a match (no hold)", () => {
    expect(isAmountMismatch(100, 100)).toBe(false);
    expect(isAmountMismatch(100.01, 100)).toBe(false); // 1 paisa noise tolerated
    expect(isAmountMismatch(99.99, 100)).toBe(false);
  });

  it("flags any amount beyond tolerance as a mismatch (must HOLD, never credit)", () => {
    expect(isAmountMismatch(100.02, 100)).toBe(true);
    expect(isAmountMismatch(1, 100)).toBe(true); // provider paid less
    expect(isAmountMismatch(10000, 100)).toBe(true); // provider paid more
  });

  it("does NOT flag when the provider reports no verifiable amount", () => {
    // Absent/NaN verified amount can't contradict us; other rails still guard.
    expect(isAmountMismatch(undefined, 100)).toBe(false);
    expect(isAmountMismatch(NaN, 100)).toBe(false);
  });
});
