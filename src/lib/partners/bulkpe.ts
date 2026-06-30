/**
 * BulkPe adapter — bank/UPI payouts.
 *
 * Activate: PARTNER_PAYOUT_ENABLED=true  (flags.payout)
 *   needs: BULKPE_TOKEN  (Bearer)
 *   opt:   BULKPE_BASE_URL (defaults to https://api.bulkpe.in/client)
 *          BULKPE_WEBHOOK_SECRET (HMAC verification of incoming webhooks)
 *
 * IP whitelisting: BulkPe only accepts requests from pre-registered source
 * IPs. The EC2 box must egress from a static Elastic IP that is registered in
 * the BulkPe dashboard. See docs/PAYOUT.md.
 *
 * Idempotency: every payout carries a unique `reference_id` (our
 * PayoutRequest.bulkpeReferenceId). Re-sending the same reference_id is a
 * no-op at BulkPe and returns the current state — this is what makes the
 * worker retry-safe.
 */
import crypto from "crypto";
import type { PartnerResult, PayoutInput, PayoutOutput, PayoutProvider } from "./types";

const DEFAULT_BASE = "https://api.bulkpe.in/client";

function baseUrl(): string {
  return (process.env.BULKPE_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function token(): string {
  const t = process.env.BULKPE_TOKEN;
  if (!t) throw new Error("[bulkpe] BULKPE_TOKEN is not configured");
  return t;
}

type BulkpeEnvelope<T> = {
  status?: boolean;
  statusCode?: number;
  message?: string;
  data?: T;
};

async function bulkpePost<T>(path: string, body: unknown): Promise<PartnerResult<T>> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as BulkpeEnvelope<T>;
    if (!res.ok || json.status === false) {
      return {
        ok: false,
        code: json.statusCode ? `BULKPE_${json.statusCode}` : `HTTP_${res.status}`,
        message: json.message || res.statusText || "BulkPe request failed",
        raw: json,
      };
    }
    return { ok: true, data: (json.data ?? json) as T, raw: json };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

async function bulkpeGet<T>(path: string): Promise<PartnerResult<T>> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token()}` },
    });
    const json = (await res.json().catch(() => ({}))) as BulkpeEnvelope<T>;
    if (!res.ok || json.status === false) {
      return {
        ok: false,
        code: json.statusCode ? `BULKPE_${json.statusCode}` : `HTTP_${res.status}`,
        message: json.message || res.statusText || "BulkPe request failed",
        raw: json,
      };
    }
    return { ok: true, data: (json.data ?? json) as T, raw: json };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

type BulkpeBalance = {
  balance?: number | string;
  availableBalance?: number | string;
  amount?: number | string;
};

/** Map BulkPe lifecycle strings to our coarse terminal/in-flight states. */
function mapStatus(raw: string | undefined): PayoutOutput["status"] {
  switch ((raw || "").toUpperCase()) {
    case "SUCCESS":
    case "COMPLETED":
    case "PAID":
      return "PAID";
    case "FAILED":
    case "REVERSED":
    case "RETURNED":
    case "CANCELLED":
      return "FAILED";
    default:
      // INITIATED | PROCESSING | PENDING | QUEUED | anything unknown
      return "PROCESSING";
  }
}

type BulkpeTxn = {
  transcation_id?: string;
  transaction_id?: string;
  reference_id?: string;
  status?: string;
  utr?: string;
  rrn?: string;
};

function readTxnId(d: BulkpeTxn): string {
  return d.transcation_id || d.transaction_id || d.reference_id || "";
}

export const bulkpePayout: PayoutProvider = {
  name: "BULKPE",
  async payout(input: PayoutInput) {
    const isUpi = input.mode === "UPI";
    const body: Record<string, unknown> = {
      amount: input.amount,
      payment_mode: input.mode,
      reference_id: input.idempotencyKey,
      beneficiaryName: input.beneficiary.name,
      transcation_note: input.purpose,
    };
    if (isUpi) {
      body.upi = input.beneficiary.vpa;
    } else {
      body.account_number = input.beneficiary.accountNumber;
      body.ifsc = input.beneficiary.ifsc;
    }

    const r = await bulkpePost<BulkpeTxn>("/initiatePayout", body);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        payoutId: readTxnId(r.data),
        utr: r.data.utr,
        status: mapStatus(r.data.status),
      },
      partnerTxnId: readTxnId(r.data),
      raw: r.raw,
    };
  },

  async status(payoutIdOrReference: string) {
    // BulkPe's /fetchStatus accepts EXACTLY ONE lookup key. Our reference_ids
    // are prefixed "PO"; a BulkPe txn id is anything else. Prefer reference_id
    // (we always persist it) and only fall back to transcation_id.
    const body = payoutIdOrReference.startsWith("PO")
      ? { reference_id: payoutIdOrReference }
      : { transcation_id: payoutIdOrReference };
    const r = await bulkpePost<BulkpeTxn>("/fetchStatus", body);
    if (!r.ok) return r;
    return {
      ok: true,
      data: { status: mapStatus(r.data.status), utr: r.data.utr },
      raw: r.raw,
    };
  },

  // GET /client/fetchBalance → current BulkPe wallet balance (rupees).
  async fetchBalance() {
    const r = await bulkpeGet<BulkpeBalance>("/fetchBalance");
    if (!r.ok) return r;
    const d = r.data ?? {};
    const raw = d.balance ?? d.availableBalance ?? d.amount ?? 0;
    const balance = typeof raw === "string" ? Number(raw) : raw;
    return { ok: true, data: Number.isFinite(balance) ? balance : 0, raw: r.raw };
  },
};

/** True when BulkPe credentials are present. */
export function bulkpeConfigured(): boolean {
  return Boolean(process.env.BULKPE_TOKEN);
}

/**
 * Verify a BulkPe webhook signature. Always run this before trusting the body.
 * BulkPe signs the raw JSON body with HMAC-SHA256 using BULKPE_WEBHOOK_SECRET.
 */
export function verifyBulkpeWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BULKPE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // Normalize common header encodings (hex, or "sha256=" prefixed).
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
