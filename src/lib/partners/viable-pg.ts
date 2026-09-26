/**
 * Viable DigiSeva PG adapter — hosted-checkout payin (wallet top-up / PG collect).
 *
 * Activate: PARTNER_UPI_ENABLED=true  (flags.upi)
 *   needs: VIABLE_PG_API_KEY   (header: x-api-key)
 *          VIABLE_PG_USERCODE  (header: usercode  — your POS id)
 *   opt:   VIABLE_PG_BASE_URL   (default https://api.viabledigiseva.com)
 *          VIABLE_PG_ACCESS_MODE (header: access-mode, default "web")
 *          VIABLE_PG_ROUTE       (default primary channel, default "razorpay1")
 *          VIABLE_PG_CHANNELS    ("route:Label,route:Label" allow-list override)
 *
 * IP whitelisting: Viable only accepts requests from pre-registered source IPs.
 * The EC2 box must egress from the whitelisted Elastic IP.
 *
 * NO WEBHOOK: Viable does not offer webhooks. Settlement is poll-only —
 *   1. client polls GET /api/wallet/topup?refId=… (settleTopup),
 *   2. the redirect back to the wallet resumes that poll,
 *   3. the TOPUP_RECONCILE worker sweep catches "paid but browser closed".
 * All three converge on the same idempotent settle, which ALWAYS re-verifies
 * with TransactionStatus before crediting a wallet.
 *
 * Multi-gateway: Viable exposes several gateway "channels" behind one credential
 * (POST /v3/pg/v1/{route}). The status endpoint (/v3/Wallet/TransactionStatus)
 * is channel-independent and is keyed by the numeric `topupId` we persist as the
 * Transaction.partnerTxnId — a lookup by orderId (tranRef) does NOT work.
 *
 * MONEY-SAFETY INVARIANTS (do not weaken without sign-off):
 *  1. NEVER credit from a redirect/callback. Only settleTopup/settlePgCollect,
 *     which re-verify via status() before crediting, may credit.
 *  2. status() reports PAID ONLY on a positively-recognised success code — any
 *     unknown code stays CREATED (keep polling), never credits.
 *  3. The settle layer cross-checks the provider-verified amount and parks any
 *     mismatch in HOLD (no credit) + a critical ops alert.
 *  4. create-order is NEVER retried (no idempotency key on create → a retry can
 *     mint a duplicate topupId). Only the idempotent status read is retried.
 *
 * REFUNDS / REVERSALS / CHARGEBACKS: Viable exposes NO refund API and NO
 * chargeback/reversal webhook. A wallet top-up credits the agent's OWN wallet
 * (a liability we hold), so a post-facto reversal is handled operationally via
 * the admin Wallet Operations ledger adjustment (audited, idempotency-keyed) —
 * there is intentionally no automated refund path on this adapter. If Viable
 * later ships a refund API, add it here behind the same re-verify guard.
 *
 * PCI-DSS: card data never touches our servers. The customer enters card/UPI
 * credentials on Viable's HOSTED checkout page (checkoutUrl); we only ever see
 * an order id, an amount, and a bank UTR. This keeps us out of PCI scope
 * (SAQ-A). Do NOT proxy or capture card fields on our origin.
 */
import type { PartnerResult, UpiCollectInput, UpiCollectOutput, UpiProvider } from "./types";

const DEFAULT_BASE = "https://api.viabledigiseva.com";
const DEFAULT_ROUTE = "razorpay1";

function baseUrl(): string {
  return (process.env.VIABLE_PG_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function primaryRoute(): string {
  return process.env.VIABLE_PG_ROUTE || DEFAULT_ROUTE;
}

/** Auth + content headers Viable expects on every call. */
function viableHeaders(): Record<string, string> {
  return {
    accept: "*/*",
    // Viable's IIS/.NET stack advertises this content-type; it is what our
    // live tests were validated against. Standard application/json also binds,
    // but we match the proven request exactly.
    "content-type": "application/json-patch+json",
    "x-api-key": process.env.VIABLE_PG_API_KEY || "",
    usercode: process.env.VIABLE_PG_USERCODE || "",
    "access-mode": process.env.VIABLE_PG_ACCESS_MODE || "web",
  };
}

/** True when Viable PG credentials are present. */
export function viableConfigured(): boolean {
  return Boolean(process.env.VIABLE_PG_API_KEY && process.env.VIABLE_PG_USERCODE);
}

// ---------------------------------------------------------------------------
// Gateway channels
// ---------------------------------------------------------------------------

export type ViableChannel = {
  /** Stable id used by the UI + persisted with the top-up. */
  id: string;
  /** Human label shown in the "choose a gateway" selector. */
  label: string;
  /** The {route} path segment in /v3/pg/v1/{route}. */
  route: string;
  /** The primary/default channel (pre-selected in the UI). */
  primary?: boolean;
};

/**
 * Known-good channels (verified live). `premimumpg5` is intentionally excluded
 * — it returns HTTP 500. Override the list via VIABLE_PG_CHANNELS.
 */
const DEFAULT_CHANNELS: ViableChannel[] = [
  { id: "razorpay1", label: "Razorpay", route: "razorpay1" },
  { id: "razorpay2", label: "Razorpay (Alt)", route: "razorpay2" },
  { id: "razorpay4", label: "OpenMoney", route: "razorpay4" },
  { id: "razorpay5", label: "Express Pay", route: "razorpay5" },
  { id: "premimumpg3", label: "Premium PG", route: "premimumpg3" },
];

/**
 * The configured channel list. VIABLE_PG_CHANNELS, when set, is a comma list of
 * "route" or "route:Label" pairs and fully replaces the default set. The
 * primary is VIABLE_PG_ROUTE (or the first channel).
 */
export function viableChannels(): ViableChannel[] {
  const raw = process.env.VIABLE_PG_CHANNELS?.trim();
  let list: ViableChannel[];
  if (raw) {
    list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [route, ...labelParts] = pair.split(":");
        const r = route.trim();
        const label = labelParts.join(":").trim() || r;
        return { id: r, label, route: r };
      });
  } else {
    list = DEFAULT_CHANNELS.map((c) => ({ ...c }));
  }
  const primary = primaryRoute();
  list = list.map((c) => ({ ...c, primary: c.route === primary }));
  // Guarantee exactly one primary: if the configured primary isn't in the list,
  // fall back to the first channel.
  if (!list.some((c) => c.primary) && list.length > 0) list[0].primary = true;
  return list;
}

/** Resolve a requested channel id/route to a concrete route (defaults to primary). */
export function resolveChannelRoute(channel?: string): string {
  const channels = viableChannels();
  if (channel) {
    const hit = channels.find((c) => c.id === channel || c.route === channel);
    if (hit) return hit.route;
  }
  const primary = channels.find((c) => c.primary);
  return primary?.route || primaryRoute();
}

// ---------------------------------------------------------------------------
// Response shapes + status mapping
// ---------------------------------------------------------------------------

type ViableCreateData = {
  topupId?: number;
  orderId?: string;
  checkoutUrl?: string;
  sessionToken?: string;
};

type ViableEnvelope<T> = {
  status?: boolean;
  responseCode?: number;
  message?: string;
  data?: T;
};

type ViableStatusData = {
  topupId?: number;
  amount?: number;
  charge?: number;
  reason?: string;
  remarks?: string;
  bankTranRef?: string;
  status?: string; // single-letter code: "A" | "P" | "F" | …
  statusName?: string; // "Approved" | "Pending" | "Failed" | …
};

/**
 * Map Viable's (status code, statusName) to our coarse collect state.
 * Verified live: "A"/"Approved" = paid, "P"/"Pending" = awaiting payment.
 * Failure codes are mapped defensively by name so an unseen code can never be
 * mistaken for success — anything we don't positively recognise as PAID stays
 * CREATED (keep polling) unless it clearly reads as failed/expired.
 * Exported for tests.
 */
export function mapViableStatus(
  code: string | undefined,
  name: string | undefined
): "CREATED" | "PAID" | "FAILED" | "EXPIRED" {
  const c = (code || "").trim().toUpperCase();
  const n = (name || "").trim().toLowerCase();

  // Positive success — the ONLY path that credits a wallet.
  if (c === "A" || n.includes("approv") || n.includes("success") || n.includes("paid")) {
    return "PAID";
  }
  // Expired.
  if (c === "E" || n.includes("expire")) return "EXPIRED";
  // Clear failures.
  if (
    c === "F" ||
    c === "R" ||
    c === "D" ||
    c === "C" ||
    n.includes("fail") ||
    n.includes("reject") ||
    n.includes("declin") ||
    n.includes("cancel") ||
    n.includes("void")
  ) {
    return "FAILED";
  }
  // Pending / initiated / anything unknown → keep polling, never credit.
  return "CREATED";
}

const DEFAULT_TIMEOUT_MS = Number(process.env.VIABLE_PG_TIMEOUT_MS ?? 15_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ViablePostResult<T> = PartnerResult<ViableEnvelope<T>> & { httpStatus?: number };

async function viablePostOnce<T>(path: string, body: unknown, timeoutMs: number): Promise<ViablePostResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: viableHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: ViableEnvelope<T> = {};
    try {
      json = text ? (JSON.parse(text) as ViableEnvelope<T>) : {};
    } catch {
      json = {};
    }
    // Viable returns HTTP 200 with {"message":"Not found"} for an unmapped
    // gateway, and HTTP 500 (empty) for a broken one. Treat both as failures.
    const notFound = (json.message || "").toLowerCase() === "not found";
    if (!res.ok || json.status === false || notFound || (!json.data && !json.status)) {
      return {
        ok: false,
        code: notFound ? "GATEWAY_NOT_FOUND" : json.responseCode ? `VIABLE_${json.responseCode}` : `HTTP_${res.status}`,
        message: json.message || (res.status >= 500 ? "Gateway unavailable" : res.statusText) || "Viable PG request failed",
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
 * POST with a hard timeout. `retries` is ONLY safe for idempotent reads
 * (status). NEVER pass retries>0 to a create-order call — a retried create can
 * mint a duplicate order/topupId. Network/timeout errors surface as TIMEOUT /
 * NETWORK codes so callers can decide whether to fail over.
 */
async function viablePost<T>(
  path: string,
  body: unknown,
  opts?: { retries?: number; timeoutMs?: number }
): Promise<ViablePostResult<T>> {
  const retries = opts?.retries ?? 0;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastErr: ViablePostResult<T> = { ok: false, code: "NETWORK", message: "request failed" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await viablePostOnce<T>(path, body, timeoutMs);
    } catch (e) {
      const isAbort = (e as Error).name === "AbortError";
      lastErr = { ok: false, code: isAbort ? "TIMEOUT" : "NETWORK", message: isAbort ? "Viable PG timed out" : (e as Error).message };
      if (attempt < retries) await sleep(300 * (attempt + 1));
    }
  }
  return lastErr;
}

// ---------------------------------------------------------------------------
// UpiProvider implementation
// ---------------------------------------------------------------------------

export const viableUpi: UpiProvider = {
  name: "VIABLE_PG",

  async collect(input: UpiCollectInput): Promise<PartnerResult<UpiCollectOutput>> {
    const body = {
      amount: input.amount, // rupees (verified: Viable amounts are in ₹)
      name: input.customerName || "NextGenPay Customer",
      mobile: input.customerPhone,
      email: input.customerEmail || "noreply@nextgenpay.co.in",
      redirectUri: input.callbackUrl,
    };
    const requested = resolveChannelRoute(input.channel);
    // Auto-failover: try the requested gateway first, then the rest. A DOWN
    // gateway errors WITHOUT creating an order, so at most one real order is
    // ever created. A single down gateway therefore never blocks a customer.
    const routes = [requested, ...viableChannels().map((c) => c.route).filter((r) => r !== requested)];

    let lastErr: PartnerResult<UpiCollectOutput> = { ok: false, code: "NO_CHANNEL", message: "No payment gateway is available right now" };
    for (const route of routes) {
      // retries:0 — NEVER retry a create; a retried create can mint a duplicate
      // order/topupId (Viable gives us no idempotency key on create).
      const r = await viablePost<ViableCreateData>(`/v3/pg/v1/${route}`, body, { retries: 0 });
      if (r.ok) {
        const d = r.data?.data ?? {};
        if (!d.topupId || !d.checkoutUrl) {
          recordHealth(route, false, "Bad response");
          lastErr = { ok: false, code: "BAD_RESPONSE", message: "Gateway did not return a checkout URL", raw: r.raw };
          continue; // treat as unusable → fail over
        }
        recordHealth(route, true, "OK");
        // We key the whole lifecycle off the numeric topupId — it is the ONLY
        // value TransactionStatus accepts (orderId/tranRef lookups return
        // "Not found"). So our orderId / partnerTxnId is the topupId; the real
        // order_… id and the chosen gateway are kept in raw for audit.
        const topupId = String(d.topupId);
        return {
          ok: true,
          data: { orderId: topupId, paymentUrl: d.checkoutUrl },
          partnerTxnId: topupId,
          raw: { ...(r.raw as Record<string, unknown>), _viableOrderId: d.orderId, _viableRoute: route },
        };
      }
      const http = r.httpStatus ?? 0;
      const gatewayDown = r.code === "GATEWAY_NOT_FOUND" || r.code === "TIMEOUT" || r.code === "NETWORK" || http >= 500;
      if (gatewayDown) {
        recordHealth(
          route,
          false,
          r.code === "GATEWAY_NOT_FOUND" ? "Not mapped" : http >= 500 ? "Gateway error" : r.code === "TIMEOUT" ? "Timeout" : "Network error"
        );
        lastErr = r;
        continue; // fail over to the next gateway
      }
      // A validation/4xx means the gateway is UP but rejected THIS request (e.g.
      // amount below min) — it would fail on every gateway, so return it.
      recordHealth(route, true, "OK");
      return r;
    }
    return lastErr;
  },

  async status(orderId: string) {
    // orderId here is the topupId we persisted as partnerTxnId. Viable's status
    // model wants an integer topupId; a non-numeric value is tried as tranRef
    // (defensive — real lookups are always numeric).
    const numeric = /^\d+$/.test(orderId);
    const body = numeric ? { topupId: Number(orderId), tranRef: "" } : { topupId: 0, tranRef: orderId };
    // retries:1 — status is an idempotent READ, safe to retry once on timeout.
    const r = await viablePost<ViableStatusData>("/v3/Wallet/TransactionStatus", body, { retries: 1 });
    if (!r.ok) return r;
    const d = r.data?.data ?? {};
    return {
      ok: true,
      data: {
        status: mapViableStatus(d.status, d.statusName),
        // Provider-verified amount + bank UTR — used by the settle layer to
        // cross-check before crediting, and for receipts.
        amount: typeof d.amount === "number" ? d.amount : undefined,
        reference: d.bankTranRef || undefined,
        paidAt: undefined,
      },
      raw: r.raw,
    };
  },
};

// ---------------------------------------------------------------------------
// Health probing (there is no dedicated health endpoint — we create a tiny
// probe order and read the HTTP/app response). Cached in-process so opening the
// "load funds" page repeatedly doesn't spam the gateway.
// ---------------------------------------------------------------------------

export type ChannelHealth = {
  id: string;
  label: string;
  route: string;
  primary: boolean;
  healthy: boolean;
  checkedAt: string;
  detail: string;
};

const HEALTH_TTL_MS = Number(process.env.VIABLE_PG_HEALTH_TTL_MS ?? 300_000); // 5 min
const PROBE_AMOUNT = Number(process.env.VIABLE_PG_PROBE_AMOUNT ?? 1);
const healthCache = new Map<string, { healthy: boolean; detail: string; checkedAt: number }>();

/**
 * PASSIVELY record a gateway outcome from a REAL collect attempt — no probe
 * order created. This is what keeps the health view fresh from actual traffic
 * so the page doesn't need to spam probe orders; active probing only fills gaps
 * for gateways with no recent real usage.
 */
export function recordHealth(route: string, healthy: boolean, detail: string): void {
  healthCache.set(route, { healthy, detail, checkedAt: Date.now() });
}

/**
 * Seed the in-process health cache from a persisted cross-process snapshot (the
 * worker's periodic probe). Only fills a route when we have NO local sample or
 * the snapshot is strictly fresher — so live local traffic always wins. Lets the
 * web process show the worker's health view without minting its own probe orders
 * on a cold start. Accepts the shape returned by ops/telemetry readGatewayHealth.
 */
export function hydrateHealthCache(
  snapshot: { gateways: Array<{ route: string; healthy: boolean | null; detail: string; checkedAt: string | null }> } | null
): void {
  if (!snapshot?.gateways) return;
  for (const g of snapshot.gateways) {
    if (g.healthy === null || !g.checkedAt) continue;
    const checkedAt = new Date(g.checkedAt).getTime();
    if (Number.isNaN(checkedAt)) continue;
    const existing = healthCache.get(g.route);
    if (!existing || checkedAt > existing.checkedAt) {
      healthCache.set(g.route, { healthy: g.healthy, detail: g.detail, checkedAt });
    }
  }
}

async function probeRoute(route: string): Promise<{ healthy: boolean; detail: string }> {
  const r = await viablePost<ViableCreateData>(
    `/v3/pg/v1/${route}`,
    {
      amount: PROBE_AMOUNT,
      name: "Health Probe",
      mobile: "9999999999",
      email: "noreply@nextgenpay.co.in",
      redirectUri: "https://nextgenpay.co.in/health",
    },
    { retries: 0 }
  );
  if (r.ok) return { healthy: true, detail: "OK" };
  // A validation error (e.g. amount too low) means the gateway is UP; only
  // GATEWAY_NOT_FOUND / 5xx mean it's down/unmapped.
  const http = r.httpStatus ?? 0;
  if (r.code === "GATEWAY_NOT_FOUND") return { healthy: false, detail: "Not mapped" };
  if (http >= 500) return { healthy: false, detail: "Gateway error" };
  if (http >= 400 && http < 500) return { healthy: true, detail: "OK" };
  if (r.code === "NETWORK") return { healthy: false, detail: "Network error" };
  return { healthy: false, detail: r.message || "Unavailable" };
}

/**
 * Return per-channel health for the UI. Uses a short in-process cache; set
 * `force` to bypass it. Probes run in parallel. If credentials are missing,
 * every channel is reported unhealthy.
 */
export async function viableChannelHealth(force = false): Promise<ChannelHealth[]> {
  const channels = viableChannels();
  const now = Date.now();
  const configured = viableConfigured();

  const results = await Promise.all(
    channels.map(async (c): Promise<ChannelHealth> => {
      if (!configured) {
        return { ...toBase(c), healthy: false, checkedAt: new Date(now).toISOString(), detail: "Not configured" };
      }
      const cached = healthCache.get(c.route);
      if (!force && cached && now - cached.checkedAt < HEALTH_TTL_MS) {
        return { ...toBase(c), healthy: cached.healthy, checkedAt: new Date(cached.checkedAt).toISOString(), detail: cached.detail };
      }
      const probe = await probeRoute(c.route);
      healthCache.set(c.route, { ...probe, checkedAt: now });
      return { ...toBase(c), healthy: probe.healthy, checkedAt: new Date(now).toISOString(), detail: probe.detail };
    })
  );
  return results;

  function toBase(c: ViableChannel) {
    return { id: c.id, label: c.label, route: c.route, primary: !!c.primary };
  }
}

/**
 * Read-ONLY health snapshot from the in-process cache — never creates a probe
 * order. For surfaces that are polled frequently (admin dashboard) where minting
 * ₹1 probe orders on every page load would be wasteful. Routes with no cached
 * sample yet report `healthy: null` ("unknown"). The cache is warmed by real
 * customer traffic (recordHealth) and the pg.health worker sweep.
 */
export function viableChannelHealthCached(): Array<
  Omit<ChannelHealth, "healthy" | "checkedAt"> & { healthy: boolean | null; checkedAt: string | null }
> {
  return viableChannels().map((c) => {
    const cached = healthCache.get(c.route);
    return {
      id: c.id,
      label: c.label,
      route: c.route,
      primary: !!c.primary,
      healthy: cached ? cached.healthy : null,
      checkedAt: cached ? new Date(cached.checkedAt).toISOString() : null,
      detail: cached ? cached.detail : "No sample yet",
    };
  });
}
