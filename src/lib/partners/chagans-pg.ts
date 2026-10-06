/**
 * Chagans Technologies PartnerPG adapter — hosted-checkout payin (wallet
 * top-up), offered ALONGSIDE Viable DigiSeva PG as a second selectable rail.
 *
 * Activate: PARTNER_UPI_ENABLED=true (flags.upi) + the three credentials:
 *   CHAGAN_CLIENT_ID      (header: client-id      — treat as username)
 *   CHAGAN_CLIENT_SECRET  (header: client-secret  — secret key)
 *   CHAGAN_API_TOKEN      (header: Authorization: Bearer <JWT>)
 *   opt: CHAGAN_BASE_URL     (default https://chagans.com)
 *        CHAGAN_WEBHOOK_IPS  (CSV allow-list of Chagan's webhook source IPs)
 *        CHAGAN_COMET_MAX / CHAGAN_STAR_MAX  (per-gateway rupee caps)
 *
 * Two gateways behind one credential, selected via `pgType` + `mode`:
 *   - Comet  (pgType chagans3, mode t1, next-day settlement) — a UNIQUE/random
 *     amount is MANDATORY (the gateway rejects duplicate amounts).
 *   - Star   (pgType chagans2, mode t0, same-day settlement).
 * We add random paise to EVERY Chagan charge so no two in-flight orders ever
 * collide on amount (defeats the "Amount already used" rejection) — the paise
 * are part of what the customer pays and are credited back in full.
 *
 * ── MONEY-SAFETY (Chagans has NO status/polling API) ──────────────────────
 * Unlike Viable, Chagans offers no TransactionStatus endpoint — settlement is
 * WEBHOOK-AUTHORITATIVE only. We therefore mark this provider `webhookOnly` so
 * the settle layer NEVER pulls a status and NEVER credits from a redirect. The
 * ONLY path that credits a Chagan top-up is the inbound webhook
 * (/api/webhooks/chagans-pg), which is authenticated by SOURCE IP (Chagan posts
 * only from CHAGAN_WEBHOOK_IPS — a remote attacker cannot complete a TCP POST
 * from a spoofed source IP), then cross-checks the verified amount and credits
 * idempotently. A lost webhook never costs us money (we simply don't credit);
 * such orders expire and alert ops for manual reconciliation against Chagan.
 *
 * txnId constraint (verified live): Chagans REJECTS txnIds containing
 * underscores / hyphens / special chars. Our refIds are alphanumeric-only
 * (see wallet/topup.ts) so they are safe to send verbatim as txnId.
 *
 * PCI-DSS: the customer enters card/UPI credentials on Chagans' HOSTED page
 * (the returned `link`); we only ever see an orderId, an amount and a status.
 */
import type { PartnerResult, UpiCollectInput, UpiCollectOutput, UpiProvider, UpiStatusOutput } from "./types";

const DEFAULT_BASE = "https://chagans.com";
const DEFAULT_WEBHOOK_IPS = "103.160.160.129,34.126.212.125";
const DEFAULT_TIMEOUT_MS = Number(process.env.CHAGAN_TIMEOUT_MS ?? 15_000);

function baseUrl(): string {
  return (process.env.CHAGAN_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

/** Auth + content headers Chagans expects on every call (all three required). */
function chagansHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "client-id": process.env.CHAGAN_CLIENT_ID || "",
    "client-secret": process.env.CHAGAN_CLIENT_SECRET || "",
    authorization: `Bearer ${process.env.CHAGAN_API_TOKEN || ""}`,
  };
}

/** True when all three Chagans credentials are present. */
export function chagansConfigured(): boolean {
  return Boolean(
    process.env.CHAGAN_CLIENT_ID &&
      process.env.CHAGAN_CLIENT_SECRET &&
      process.env.CHAGAN_API_TOKEN
  );
}

// ---------------------------------------------------------------------------
// Gateways
// ---------------------------------------------------------------------------

export type ChagansGateway = {
  /** Stable id used by the UI + persisted selection ("comet" | "star"). */
  id: "comet" | "star";
  label: string;
  /** pgType sent to Chagans. */
  pgType: string;
  /** Settlement mode sent to Chagans. */
  mode: "t0" | "t1";
  /** Per-transaction rupee cap (account-specific; env-overridable). */
  maxAmount: number;
  /**
   * When true, the charged amount MUST be made unique-to-paise (the gateway
   * rejects duplicate amounts). Comet mandates this; Star was validated live
   * with round amounts, so it stays round unless this is flipped on.
   */
  requiresRandom: boolean;
  primary?: boolean;
};

function num(envVal: string | undefined, fallback: number): number {
  const n = Number(envVal);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The two live gateways. Caps default to the account limits Chagan confirmed
 * for us (Comet ₹1,00,000; Star ₹40,000 card) and are env-overridable. A
 * request over the cap is rejected locally (clearer than a Chagans HTTP 400)
 * — no money moves either way, so the cap is a UX guard, not a money rail.
 */
export function chagansGateways(): ChagansGateway[] {
  return [
    {
      id: "comet",
      label: "Comet PG",
      pgType: "chagans3",
      mode: "t1",
      maxAmount: num(process.env.CHAGAN_COMET_MAX, 100000),
      requiresRandom: true, // Comet mandates a unique/random amount
      primary: true,
    },
    {
      id: "star",
      label: "Star PG",
      pgType: "chagans2",
      mode: "t0",
      maxAmount: num(process.env.CHAGAN_STAR_MAX, 40000),
      // Validated live with round amounts. Flip to true (or set
      // CHAGAN_STAR_RANDOM=true) if Star starts rejecting duplicate amounts.
      requiresRandom: process.env.CHAGAN_STAR_RANDOM === "true",
    },
  ];
}

/** Resolve a requested gateway id to its config (defaults to Comet/primary). */
export function resolveChagansGateway(id?: string): ChagansGateway {
  const gws = chagansGateways();
  const hit = id ? gws.find((g) => g.id === id || g.pgType === id) : undefined;
  return hit || gws.find((g) => g.primary) || gws[0];
}

// ---------------------------------------------------------------------------
// Unique/random amount — EVERY Chagan charge is made unique to the paise so two
// in-flight orders never collide on amount. The random paise are credited back
// in full (we credit exactly what the customer pays), so there is no loss.
// Exported for unit tests.
// ---------------------------------------------------------------------------
export function randomizeChagansAmount(amount: number): number {
  // 1..99 random paise added to the whole-rupee (or given) amount. We floor to
  // whole rupees first so the paise slot is always free to carry our nonce.
  const rupees = Math.max(1, Math.floor(amount));
  const paise = 1 + Math.floor(Math.random() * 99); // 1..99
  return Math.round((rupees + paise / 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Create-order
// ---------------------------------------------------------------------------

type ChagansCreateData = {
  orderId?: string;
  amount?: number;
  paymentType?: string;
  gateway?: string;
  txnId?: string;
};

type ChagansEnvelope = {
  message?: string;
  code?: number;
  success?: boolean;
  link?: string;
  data?: ChagansCreateData;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chagansPostOnce(path: string, body: unknown, timeoutMs: number): Promise<
  PartnerResult<ChagansEnvelope> & { httpStatus?: number }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: chagansHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: ChagansEnvelope = {};
    try {
      json = text ? (JSON.parse(text) as ChagansEnvelope) : {};
    } catch {
      json = {};
    }
    // Chagans returns HTTP 200 with success:false for business-logic errors
    // (duplicate txnId/amount, pg not active, internal error). ALWAYS trust the
    // success flag over the HTTP status (per the API doc).
    if (!res.ok || json.success !== true || !json.link || !json.data?.orderId) {
      return {
        ok: false,
        code: json.code ? `CHAGAN_${json.code}` : `HTTP_${res.status}`,
        message: json.message || (res.status >= 500 ? "Gateway unavailable" : res.statusText) || "Chagans PG request failed",
        raw: json,
        httpStatus: res.status,
      };
    }
    return { ok: true, data: json, raw: json, httpStatus: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST with a hard timeout. We NEVER retry a create — a retried create can mint
 * a duplicate order (and Chagans would also reject the re-used txnId). Only the
 * network/timeout envelope is surfaced so the caller can fail the top-up safely
 * (no money has moved: a create either returns a link or an error).
 */
async function chagansPost(path: string, body: unknown): Promise<
  PartnerResult<ChagansEnvelope> & { httpStatus?: number }
> {
  try {
    return await chagansPostOnce(path, body, DEFAULT_TIMEOUT_MS);
  } catch (e) {
    const isAbort = (e as Error).name === "AbortError";
    return { ok: false, code: isAbort ? "TIMEOUT" : "NETWORK", message: isAbort ? "Chagans PG timed out" : (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// UpiProvider implementation
// ---------------------------------------------------------------------------

export const chagansUpi: UpiProvider = {
  name: "CHAGANS_PG",
  webhookOnly: true,

  async collect(input: UpiCollectInput): Promise<PartnerResult<UpiCollectOutput>> {
    const gw = resolveChagansGateway(input.channel);
    if (input.amount > gw.maxAmount) {
      return {
        ok: false,
        code: "AMOUNT_OVER_LIMIT",
        message: `${gw.label} supports up to ₹${gw.maxAmount.toLocaleString("en-IN")} per transaction.`,
      };
    }
    const webhookUrl = process.env.CHAGAN_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/chagans-pg`;
    const body = {
      amount: input.amount, // rupees; already made unique-to-paise by the caller
      pgType: gw.pgType,
      txnId: input.idempotencyKey, // our alphanumeric refId — safe for Chagans
      callback: input.callbackUrl,
      mode: gw.mode,
      webhook: webhookUrl,
      name: input.customerName || "NextGenPay Customer",
      mobile: input.customerPhone,
      email: input.customerEmail || "noreply@nextgenpay.space",
    };

    const r = await chagansPost("/partnerPg/payRequest", body);
    if (r.ok) {
      const d = r.data?.data ?? {};
      const orderId = d.orderId!;
      recordChagansHealth(gw.id, true, "OK");
      return {
        ok: true,
        // We key reconciliation off OUR txnId (= refId), which Chagan echoes in
        // its webhook. partnerTxnId carries Chagan's orderId for audit/receipts.
        data: { orderId, paymentUrl: r.data?.link },
        partnerTxnId: orderId,
        raw: { ...(r.raw as Record<string, unknown>), _chagansGateway: gw.id },
      };
    }
    const http = r.httpStatus ?? 0;
    const gatewayDown = r.code === "TIMEOUT" || r.code === "NETWORK" || http >= 500;
    recordChagansHealth(gw.id, !gatewayDown, gatewayDown ? "Gateway error" : "OK");
    return r;
  },

  // Chagans has NO status API — never attempt a pull. Returning a hard failure
  // (never CREATED/PAID) guarantees no caller can mistake a non-existent poll
  // for a successful payment. Settlement flows through the webhook instead.
  async status(_orderId: string): Promise<PartnerResult<UpiStatusOutput>> {
    return {
      ok: false,
      code: "NO_STATUS_API",
      message: "Chagans PG has no status endpoint; settlement is webhook-only.",
    };
  },
};

// ---------------------------------------------------------------------------
// Webhook — the authoritative settle signal. No documented payload schema, so
// we parse defensively across common field names and interpret status
// CONSERVATIVELY (only an explicit positive success signal credits money).
// ---------------------------------------------------------------------------

export type ChagansWebhookParse = {
  txnId?: string;
  orderId?: string;
  status: "PAID" | "FAILED" | "EXPIRED" | "PENDING" | "UNKNOWN";
  amount?: number;
  reference?: string;
  rawStatus?: string;
};

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function firstNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/**
 * Map a raw Chagan status token to our coarse state. CONSERVATIVE: anything we
 * don't positively recognise as success stays non-crediting. Exported for tests.
 */
export function mapChagansStatus(raw: string | undefined, success?: boolean, code?: number): ChagansWebhookParse["status"] {
  const s = (raw || "").trim().toLowerCase();
  if (
    s === "success" ||
    s === "paid" ||
    s === "captured" ||
    s === "completed" ||
    s === "complete" ||
    s === "settled" ||
    s === "approved" ||
    s === "successful"
  ) {
    return "PAID";
  }
  if (s.includes("expire") || s.includes("timeout")) return "EXPIRED";
  if (
    s === "failed" ||
    s === "failure" ||
    s === "declined" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "rejected" ||
    s.includes("fail") ||
    s.includes("declin")
  ) {
    return "FAILED";
  }
  // No usable textual status — fall back to explicit success flag + code, but
  // ONLY credit on an unambiguous success:true (or code 200 with no failure text).
  if (!s) {
    if (success === true) return "PAID";
    if (success === false) return "FAILED";
    if (code === 200) return "PAID";
  }
  return "UNKNOWN";
}

/** Parse a Chagan webhook body defensively. Never throws. Exported for tests. */
export function parseChagansWebhook(payload: unknown): ChagansWebhookParse {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root) as Record<string, unknown>;

  const txnId = firstString(data, ["txnId", "txn_id", "transactionId", "merchantTxnId", "refId", "reference_id"]) ||
    firstString(root, ["txnId", "txn_id", "transactionId", "merchantTxnId", "refId", "reference_id"]);
  const orderId = firstString(data, ["orderId", "order_id", "pgOrderId", "chagansOrderId"]) ||
    firstString(root, ["orderId", "order_id"]);
  const rawStatus = firstString(data, ["status", "paymentStatus", "txnStatus", "state", "paymentState"]) ||
    firstString(root, ["status", "paymentStatus", "txnStatus", "state"]);
  const amount = firstNumber(data, ["amount", "amt", "paidAmount", "txnAmount"]) ??
    firstNumber(root, ["amount", "amt"]);
  const reference = firstString(data, ["utr", "rrn", "bankRef", "bankRRN", "referenceNumber", "upiTxnId"]) ||
    firstString(root, ["utr", "rrn"]);
  const success = typeof root.success === "boolean" ? (root.success as boolean) : typeof data.success === "boolean" ? (data.success as boolean) : undefined;
  const code = firstNumber(root, ["code"]) ?? firstNumber(data, ["code"]);

  return {
    txnId,
    orderId,
    status: mapChagansStatus(rawStatus, success, code),
    amount,
    reference,
    rawStatus,
  };
}

/** The allow-list of IPs Chagans posts webhooks from. */
export function chagansWebhookIps(): string[] {
  return (process.env.CHAGAN_WEBHOOK_IPS || DEFAULT_WEBHOOK_IPS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when `ip` is one of Chagan's whitelisted webhook source IPs. */
export function isChagansWebhookIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return chagansWebhookIps().includes(ip.trim());
}

// ---------------------------------------------------------------------------
// Health — Chagans exposes no health/probe endpoint and creating a real order
// to probe would consume a txnId + pollute the gateway, so health is derived
// passively: "available" when configured, downgraded in-process by a REAL
// failed collect (like Viable's recordHealth) and re-upgraded by a success.
// ---------------------------------------------------------------------------

export type ChagansChannelHealth = {
  id: string;
  label: string;
  route: string; // gateway id (parallels Viable's shape for the UI)
  primary: boolean;
  healthy: boolean;
  detail: string;
  checkedAt: string;
  maxAmount: number;
};

const HEALTH_TTL_MS = Number(process.env.CHAGAN_HEALTH_TTL_MS ?? 600_000); // 10 min
const healthCache = new Map<string, { healthy: boolean; detail: string; checkedAt: number }>();

/** Record a gateway outcome from a REAL collect attempt (no probe order). */
export function recordChagansHealth(gateway: string, healthy: boolean, detail: string): void {
  healthCache.set(gateway, { healthy, detail, checkedAt: Date.now() });
}

/**
 * Per-gateway health for the wallet selector. When configured and no recent
 * failure is cached, gateways report healthy ("Available"); a recent real
 * failure keeps a gateway unhealthy until the TTL lapses.
 */
export function chagansChannelHealth(): ChagansChannelHealth[] {
  const configured = chagansConfigured();
  const now = Date.now();
  return chagansGateways().map((g): ChagansChannelHealth => {
    const base = {
      id: g.id,
      label: g.label,
      route: g.id,
      primary: !!g.primary,
      maxAmount: g.maxAmount,
    };
    if (!configured) {
      return { ...base, healthy: false, detail: "Not configured", checkedAt: new Date(now).toISOString() };
    }
    const cached = healthCache.get(g.id);
    if (cached && now - cached.checkedAt < HEALTH_TTL_MS) {
      return { ...base, healthy: cached.healthy, detail: cached.detail, checkedAt: new Date(cached.checkedAt).toISOString() };
    }
    return { ...base, healthy: true, detail: "Available", checkedAt: new Date(now).toISOString() };
  });
}
