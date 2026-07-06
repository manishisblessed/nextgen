import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 4 (platform play) tests: API-key parsing/hashing (a bug here locks
 * every partner out — or worse, lets the wrong one in), webhook body signing
 * (partners verify X-NGP-Signature against it), and the emitWebhookEvent
 * fan-out contract (must enqueue per matching endpoint, must NEVER throw).
 */

const db = vi.hoisted(() => ({
  prisma: {
    webhookEndpoint: { findMany: vi.fn() },
    webhookDelivery: { create: vi.fn() },
  },
}));
const queue = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/queue", () => ({
  enqueue: queue.enqueue,
  QUEUES: { WEBHOOK_DELIVER: "webhook.deliver" },
}));
vi.mock("@/lib/monitoring/alerts", () => ({ sendOpsAlert: vi.fn() }));

import {
  parseApiKeyHeader,
  hashApiSecret,
  generateApiKeyPair,
  isValidScope,
} from "@/lib/platform/apiKeys";
import {
  signWebhookBody,
  isValidEvent,
  emitWebhookEvent,
  MAX_ATTEMPTS,
} from "@/lib/platform/webhooks";

describe("API key header parsing", () => {
  it("parses Bearer <keyId>.<secret>", () => {
    expect(parseApiKeyHeader("Bearer ngp_live_abc123.s3cr3t-value")).toEqual({
      keyId: "ngp_live_abc123",
      secret: "s3cr3t-value",
    });
  });

  it("keeps dots inside the secret intact", () => {
    expect(parseApiKeyHeader("Bearer ngp_live_x.part1.part2")).toEqual({
      keyId: "ngp_live_x",
      secret: "part1.part2",
    });
  });

  it("rejects missing header, wrong scheme, missing dot, and foreign prefixes", () => {
    expect(parseApiKeyHeader(null)).toBeNull();
    expect(parseApiKeyHeader("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseApiKeyHeader("Bearer ngp_live_nodot")).toBeNull();
    expect(parseApiKeyHeader("Bearer ngp_live_x.")).toBeNull();
    expect(parseApiKeyHeader("Bearer sk_live_stripe.secret")).toBeNull();
  });
});

describe("API key issuance", () => {
  it("generates ngp_live_ key ids and high-entropy secrets", () => {
    const { keyId, secret } = generateApiKeyPair();
    expect(keyId).toMatch(/^ngp_live_[A-Za-z0-9_-]{12}$/);
    expect(secret.length).toBeGreaterThanOrEqual(40);
    // Round-trip: the stored hash must verify the issued secret.
    expect(hashApiSecret(secret)).toBe(crypto.createHash("sha256").update(secret).digest("hex"));
  });

  it("validates scopes against the registry", () => {
    expect(isValidScope("wallet.read")).toBe(true);
    expect(isValidScope("payout.create")).toBe(true);
    expect(isValidScope("admin.everything")).toBe(false);
  });
});

describe("webhook body signing", () => {
  it("signs with HMAC-SHA256 hex over the raw body", () => {
    const body = JSON.stringify({ event: "txn.success", data: { refId: "TXN1" } });
    const expected = crypto.createHmac("sha256", "whsec_test").update(body).digest("hex");
    expect(signWebhookBody("whsec_test", body)).toBe(expected);
  });

  it("validates event names against the registry", () => {
    expect(isValidEvent("txn.success")).toBe(true);
    expect(isValidEvent("topup.credited")).toBe(true);
    expect(isValidEvent("user.deleted")).toBe(false);
  });
});

describe("emitWebhookEvent fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a delivery + job per matching endpoint", async () => {
    db.prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep1" }, { id: "ep2" }]);
    db.prisma.webhookDelivery.create
      .mockResolvedValueOnce({ id: "d1" })
      .mockResolvedValueOnce({ id: "d2" });

    await emitWebhookEvent("user1", "payout.success", { payoutId: "p1" });

    expect(db.prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: { userId: "user1", active: true, events: { has: "payout.success" } },
      select: { id: true },
    });
    expect(db.prisma.webhookDelivery.create).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledWith(
      "webhook.deliver",
      { deliveryId: "d1" },
      { singletonKey: "webhook:d1", retryLimit: MAX_ATTEMPTS, retryDelaySec: 30 }
    );
  });

  it("does nothing when no endpoint subscribes", async () => {
    db.prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    await emitWebhookEvent("user1", "txn.failed", {});
    expect(db.prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("never throws — a webhook failure must not break the money path", async () => {
    db.prisma.webhookEndpoint.findMany.mockRejectedValue(new Error("db down"));
    await expect(emitWebhookEvent("user1", "txn.success", {})).resolves.toBeUndefined();
  });
});
