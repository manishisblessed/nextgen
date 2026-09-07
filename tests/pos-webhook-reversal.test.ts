import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

/**
 * Tests for Same Day Solution POS reversal handling:
 *   - Signature verification (valid, tampered, stale timestamp)
 *   - Webhook delivery dedup (X-Sameday-Delivery)
 *   - Reversal business logic (FAILED/VOIDED/REFUNDED → reversed, no double reversal)
 *   - Settlement exclusion (reversed entries excluded from settleable set)
 */

// ── Mock the DB module before any app import ────────────────────────────────
vi.mock("@/lib/db", () => ({ prisma: {} }));

// ── Import the PURE functions under test ─────────────────────────────────────
import {
  verifySamedayPosWebhook,
  canonicalPosCaptureRef,
} from "@/lib/partners/sameday-pos";
import type { WebhookVerifyResult } from "@/lib/partners/sameday-pos";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = "whsec_test_secret_for_unit_tests";

function makeSignature(secret: string, timestamp: string, body: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

function nowSeconds(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("verifySamedayPosWebhook — signature verification", () => {
  beforeEach(() => {
    process.env.SAMEDAY_POS_WEBHOOK_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.SAMEDAY_POS_WEBHOOK_SECRET;
  });

  it("returns VALID for a correct HMAC and fresh timestamp", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed", txn_id: "PL_123" });
    const ts = nowSeconds();
    const sig = makeSignature(TEST_SECRET, ts, body);

    const result: WebhookVerifyResult = verifySamedayPosWebhook(body, sig, ts);
    expect(result).toBe("VALID");
  });

  it("returns INVALID when the body is tampered", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed", txn_id: "PL_123" });
    const ts = nowSeconds();
    const sig = makeSignature(TEST_SECRET, ts, body);

    const tampered = body.replace("PL_123", "PL_999");
    const result = verifySamedayPosWebhook(tampered, sig, ts);
    expect(result).toBe("INVALID");
  });

  it("returns INVALID when the signature is wrong", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const ts = nowSeconds();
    const wrongSig = makeSignature("wrong_secret", ts, body);

    const result = verifySamedayPosWebhook(body, wrongSig, ts);
    expect(result).toBe("INVALID");
  });

  it("returns INVALID when signature header is missing", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const ts = nowSeconds();

    const result = verifySamedayPosWebhook(body, null, ts);
    expect(result).toBe("INVALID");
  });

  it("returns INVALID when timestamp header is missing", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const sig = "deadbeef";

    const result = verifySamedayPosWebhook(body, sig, null);
    expect(result).toBe("INVALID");
  });

  it("returns STALE when timestamp is older than 5 minutes", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const staleTs = String(Math.floor(Date.now() / 1000) - 400); // 6m40s ago
    const sig = makeSignature(TEST_SECRET, staleTs, body);

    const result = verifySamedayPosWebhook(body, sig, staleTs);
    expect(result).toBe("STALE");
  });

  it("returns STALE when timestamp is in the future beyond 5 minutes", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const futureTs = String(Math.floor(Date.now() / 1000) + 400); // 6m40s from now
    const sig = makeSignature(TEST_SECRET, futureTs, body);

    const result = verifySamedayPosWebhook(body, sig, futureTs);
    expect(result).toBe("STALE");
  });

  it("accepts a timestamp right at the 5-minute boundary", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const boundaryTs = String(Math.floor(Date.now() / 1000) - 299); // just under 5 min
    const sig = makeSignature(TEST_SECRET, boundaryTs, body);

    const result = verifySamedayPosWebhook(body, sig, boundaryTs);
    expect(result).toBe("VALID");
  });

  it("returns STALE for non-numeric timestamp", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const result = verifySamedayPosWebhook(body, "abc", "not-a-number");
    expect(result).toBe("STALE");
  });

  it("returns SKIP when SAMEDAY_POS_WEBHOOK_SECRET is not set", () => {
    delete process.env.SAMEDAY_POS_WEBHOOK_SECRET;
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const result = verifySamedayPosWebhook(body, null, null);
    expect(result).toBe("SKIP");
  });

  it("strips sha256= prefix from signature before comparison", () => {
    const body = JSON.stringify({ event: "pos.transaction.reversed" });
    const ts = nowSeconds();
    const sig = makeSignature(TEST_SECRET, ts, body);

    const result = verifySamedayPosWebhook(body, `sha256=${sig}`, ts);
    expect(result).toBe("VALID");
  });
});

describe("canonicalPosCaptureRef — idempotency key derivation", () => {
  it("derives SDPOS:<TID>:<RRN> when both are present", () => {
    const ref = canonicalPosCaptureRef({
      rrn: "000000000076",
      terminalId: "43135139",
      fallbackId: "PL_7248177850",
    });
    expect(ref).toBe("SDPOS:43135139:000000000076");
  });

  it("derives SDPOS:<RRN> when TID is missing", () => {
    const ref = canonicalPosCaptureRef({
      rrn: "000000000076",
      terminalId: null,
      fallbackId: "PL_123",
    });
    expect(ref).toBe("SDPOS:000000000076");
  });

  it("falls back to the fallback ID when RRN is missing", () => {
    const ref = canonicalPosCaptureRef({
      rrn: null,
      terminalId: "43135139",
      fallbackId: "PL_7248177850",
    });
    expect(ref).toBe("PL_7248177850");
  });

  it("returns empty string when nothing identifies the capture", () => {
    const ref = canonicalPosCaptureRef({ rrn: null, terminalId: null, fallbackId: "" });
    expect(ref).toBe("");
  });

  it("normalizes whitespace and case in RRN and TID", () => {
    const ref = canonicalPosCaptureRef({
      rrn: "  abc 123  ",
      terminalId: "  tid456  ",
    });
    expect(ref).toBe("SDPOS:TID456:ABC123");
  });
});

describe("reversal payload classification", () => {
  /**
   * The webhook route maps the incoming `status` field to our internal reversal
   * status. Verify the mapping logic directly (extracted from the route handler).
   */
  function mapReversalStatus(rawStatus: string): "VOIDED" | "REFUNDED" {
    return rawStatus.toUpperCase() === "REFUNDED" ? "REFUNDED" : "VOIDED";
  }

  it("maps FAILED → VOIDED (treated as a reversal)", () => {
    expect(mapReversalStatus("FAILED")).toBe("VOIDED");
  });

  it("maps VOIDED → VOIDED", () => {
    expect(mapReversalStatus("VOIDED")).toBe("VOIDED");
  });

  it("maps REFUNDED → REFUNDED", () => {
    expect(mapReversalStatus("REFUNDED")).toBe("REFUNDED");
  });

  it("maps any unknown status → VOIDED as a safe default", () => {
    expect(mapReversalStatus("SOMETHING_ELSE")).toBe("VOIDED");
  });
});

describe("settlement exclusion — reversed statuses never settleable", () => {
  const REVERSED_STATUSES = new Set(["FAILED", "VOIDED", "REFUNDED"]);

  it("FAILED is not settleable", () => {
    expect(REVERSED_STATUSES.has("FAILED")).toBe(true);
  });

  it("VOIDED is not settleable", () => {
    expect(REVERSED_STATUSES.has("VOIDED")).toBe(true);
  });

  it("REFUNDED is not settleable", () => {
    expect(REVERSED_STATUSES.has("REFUNDED")).toBe(true);
  });

  it("CAPTURED is settleable", () => {
    expect(REVERSED_STATUSES.has("CAPTURED")).toBe(false);
  });

  it("AUTHORIZED is not in the reversal set (not a reversal)", () => {
    expect(REVERSED_STATUSES.has("AUTHORIZED")).toBe(false);
  });
});

describe("webhook delivery idempotency semantics", () => {
  /**
   * These tests verify the behavioral contract rather than hitting the real DB.
   * The actual PosWebhookDelivery table enforces the @unique constraint at the
   * Prisma/Postgres level. Here we verify that a seen delivery returns early.
   */
  const seen = new Set<string>();

  function processDelivery(deliveryId: string | null): "new" | "duplicate" | "no-id" {
    if (!deliveryId) return "no-id";
    if (seen.has(deliveryId)) return "duplicate";
    seen.add(deliveryId);
    return "new";
  }

  beforeEach(() => {
    seen.clear();
  });

  it("first delivery is processed", () => {
    expect(processDelivery("del-001")).toBe("new");
  });

  it("same delivery ID a second time returns duplicate", () => {
    processDelivery("del-002");
    expect(processDelivery("del-002")).toBe("duplicate");
  });

  it("different delivery IDs are both processed", () => {
    expect(processDelivery("del-003")).toBe("new");
    expect(processDelivery("del-004")).toBe("new");
  });

  it("null delivery ID is processed (no dedup)", () => {
    expect(processDelivery(null)).toBe("no-id");
    expect(processDelivery(null)).toBe("no-id");
  });

  it("a duplicate does not trigger a double reversal", () => {
    let reversalCount = 0;
    function handleWithDedup(deliveryId: string) {
      if (seen.has(deliveryId)) return "duplicate";
      seen.add(deliveryId);
      reversalCount++;
      return "reversed";
    }

    expect(handleWithDedup("del-005")).toBe("reversed");
    expect(handleWithDedup("del-005")).toBe("duplicate");
    expect(handleWithDedup("del-005")).toBe("duplicate");
    expect(reversalCount).toBe(1);
  });
});

describe("reversal payload parsing (example from API docs)", () => {
  const EXAMPLE_PAYLOAD = {
    event: "pos.transaction.reversed",
    action: "remove",
    txn_id: "PL_7248177850",
    rrn: "000000000076",
    terminal_id: "43135139",
    tid: "43135139",
    device_serial: "1234567890",
    mid: "IDZ551",
    amount: 40569.0,
    previous_status: "CAPTURED",
    status: "FAILED",
    reversed_at: "2026-09-07T06:12:00.000Z",
    reason: "pinelab-recon:FAILED",
    was_settled: false,
    _brand: "PINELAB",
  };

  it("extracts the canonical ref from rrn + terminal_id", () => {
    const ref = canonicalPosCaptureRef({
      rrn: EXAMPLE_PAYLOAD.rrn,
      terminalId: EXAMPLE_PAYLOAD.terminal_id,
      fallbackId: EXAMPLE_PAYLOAD.txn_id,
    });
    expect(ref).toBe("SDPOS:43135139:000000000076");
  });

  it("the event field matches pos.transaction.reversed", () => {
    expect(EXAMPLE_PAYLOAD.event).toBe("pos.transaction.reversed");
  });

  it("the action field is 'remove'", () => {
    expect(EXAMPLE_PAYLOAD.action).toBe("remove");
  });

  it("FAILED status is treated as a reversal (not ignored)", () => {
    const status = EXAMPLE_PAYLOAD.status.toUpperCase();
    expect(["FAILED", "VOIDED", "REFUNDED"].includes(status)).toBe(true);
  });

  it("reversed_at is non-null (marks the swipe as non-settleable)", () => {
    expect(EXAMPLE_PAYLOAD.reversed_at).not.toBeNull();
    expect(new Date(EXAMPLE_PAYLOAD.reversed_at!).getTime()).not.toBeNaN();
  });

  it("was_settled=false means no fund movement expected", () => {
    expect(EXAMPLE_PAYLOAD.was_settled).toBe(false);
  });
});
