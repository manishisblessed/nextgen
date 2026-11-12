/**
 * Chagans Technologies — CC Bill Pay adapter.
 *
 * Implements the Chagans CC Bill API V2 for "Offline CC Bill Payment".
 * This replaces the RechargeKit Direct rail with a BBPS-style flow:
 *
 *   1. getBillers      — POST /ccBillPay/getBillers
 *                        Returns the list of credit-card billers (banks) for
 *                        categoryKey C15.  Cached in-process for 6 hours.
 *
 *   2. getBillerParams — POST /ccBillPay/getBillersParams
 *                        Returns the required input fields for a specific
 *                        biller AND issues an enquiryId (valid 30 min).
 *
 *   3. fetchBill       — POST /ccBillPay/fetchBill
 *                        Validates the consumer/card number and returns
 *                        the bill details (amount, due date, etc.) from
 *                        the biller using the enquiryId from step 2.
 *
 *   4. payBill         — POST /ccBillPay/payBill
 *                        Pays the bill using the same enquiryId.
 *                        The response is synchronous (success/failed in one call).
 *
 * Authentication:
 *   Same account-level credentials as Chagans PartnerPG PLUS the required
 *   `apiType: "ccBill"` header that routes the request to the CC Bill product.
 *
 * Required env vars:
 *   CHAGAN_CLIENT_ID       — same as PartnerPG
 *   CHAGAN_CLIENT_SECRET   — same as PartnerPG
 *   CHAGAN_API_TOKEN       — same as PartnerPG
 *   CHAGAN_CC_MERCHANT_ID  — merchantId returned by /ccBillpay/createMerchant
 *   opt: CHAGAN_BASE_URL   — default https://chagans.com
 *
 * Gate: PARTNER_RECHARGEKIT_DIRECT_ENABLED=true  (reuses existing flag/service key)
 *
 * Money-safety:
 *   payBill is synchronous — Chagans returns SUCCESS or FAILED in the same
 *   response (confirmed by Chagans: "There is no callback for CC Bill Pay
 *   Service"). A PENDING status (if ever returned) is treated as PROCESSING
 *   by runTransaction and the recon sweep finalises it via checkStatus.
 *   NEVER retry a payBill on timeout — money may already have moved.
 *
 *   5. checkStatus    — POST /bbps/checkStatus
 *                       Transaction status check. Used by the recon sweep and
 *                       admin panel to query the final state of a payment that
 *                       timed out or returned PENDING. NOTE: the path prefix is
 *                       /bbps/ (not /ccBillPay/) — this is correct per Chagans.
 */
import { logger } from "../logger";
import type { PartnerResult } from "./types";

const log = logger.child({ module: "chagans-cc-bill" });

/** Credit-card category key used in every Chagans CC Bill request. */
const CATEGORY_KEY = "C15";

/** Default request timeout (ms). */
const DEFAULT_TIMEOUT_MS = Number(process.env.CHAGAN_CC_TIMEOUT_MS ?? 20_000);

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return (process.env.CHAGAN_BASE_URL || "https://chagans.com").replace(/\/+$/, "");
}

/**
 * Auth + routing headers for the Chagans CC Bill API.
 * IMPORTANT: `apiType: "ccBill"` is REQUIRED — it differentiates this product
 * from the PartnerPG (top-up) rail on the same credentials. Omitting it routes
 * the request to the wrong handler on Chagans' side.
 */
function chagansCcHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "client-id": process.env.CHAGAN_CLIENT_ID || "",
    "client-secret": process.env.CHAGAN_CLIENT_SECRET || "",
    authorization: `Bearer ${process.env.CHAGAN_API_TOKEN || ""}`,
    apiType: "ccBill",
  };
}

/** The merchantId from the Chagans createMerchant onboarding call. */
function merchantId(): string {
  return process.env.CHAGAN_CC_MERCHANT_ID || "";
}

/** True when all four required credentials are present. */
export function chagansCcBillConfigured(): boolean {
  return Boolean(
    process.env.CHAGAN_CLIENT_ID &&
    process.env.CHAGAN_CLIENT_SECRET &&
    process.env.CHAGAN_API_TOKEN &&
    process.env.CHAGAN_CC_MERCHANT_ID
  );
}

// ---------------------------------------------------------------------------
// HTTP helper — single POST helper with timeout + defensive JSON parsing
// ---------------------------------------------------------------------------

type CcResponse<T> = T & { success?: boolean; message?: string; code?: number };

async function ccPost<T>(
  path: string,
  body: unknown
): Promise<PartnerResult<CcResponse<T>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: chagansCcHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    let json = {} as CcResponse<T>;
    try {
      json = text ? (JSON.parse(text) as CcResponse<T>) : ({} as CcResponse<T>);
    } catch {
      /* malformed JSON — treat as empty */
    }

    if (!res.ok) {
      return {
        ok: false,
        code: `HTTP_${res.status}`,
        message:
          (json as Record<string, unknown>).message as string ||
          res.statusText ||
          "Chagans CC Bill request failed",
        raw: json,
      };
    }

    // Chagans returns HTTP 200 with success:false for business-logic errors.
    if (json.success === false) {
      return {
        ok: false,
        code: `CHAGAN_CC_${json.code ?? "ERROR"}`,
        message: json.message || "Chagans CC Bill request failed",
        raw: json,
      };
    }

    return { ok: true, data: json, raw: json };
  } catch (e) {
    const isAbort = (e as Error).name === "AbortError";
    return {
      ok: false,
      code: isAbort ? "TIMEOUT" : "NETWORK",
      message: isAbort
        ? "Chagans CC Bill API timed out — do NOT retry a payment"
        : (e as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type ChagansCcBiller = {
  billerId: string;
  billerName: string;
};

export type ChagansCcBillerParam = {
  paramName: string;
  dataType: string; // "NUMERIC" | "ALPHA" | "ALPHANUMERIC" — Chagans may add more
};

export type ChagansCcBillerParamsResult = {
  requiredFields: ChagansCcBillerParam[];
  billerName: string;
  /** Session token valid for 30 minutes — required for fetchBill and payBill. */
  enquiryId: string;
};

export type ChagansCcFetchBillResult = {
  /**
   * Raw biller response from Chagans / BBPS gateway. Shape varies per biller.
   * Common keys: amount, dueAmount, dueDate, minAmount, customerName,
   * statementBalance, billerResponse.customerName, etc. — parsed defensively.
   */
  billerResponse: Record<string, unknown>;
  additionalInfo: Record<string, unknown>;
  message: string;
  /** Best-effort extracted due amount (₹). null when the biller doesn't return one. */
  dueAmount: number | null;
};

export type ChagansCcPayResult = {
  transactionId: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  message: string;
};

export type ChagansCcStatusResult = {
  orderId: string;
  status: "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED";
  amount?: number;
  message?: string;
};

// ---------------------------------------------------------------------------
// Biller cache — refreshed every 6h or on demand
// ---------------------------------------------------------------------------

let billerCache: ChagansCcBiller[] | null = null;
let billerCacheAt = 0;
const BILLER_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ---------------------------------------------------------------------------
// 1. getBillers
// ---------------------------------------------------------------------------

/**
 * Fetch the list of credit-card billers (card issuers / banks) for category C15.
 * Results are cached in-process for 6 hours; pass forceRefresh=true to bust.
 */
export async function chagansCcGetBillers(
  forceRefresh = false
): Promise<PartnerResult<ChagansCcBiller[]>> {
  if (
    !forceRefresh &&
    billerCache &&
    Date.now() - billerCacheAt < BILLER_CACHE_TTL_MS
  ) {
    return { ok: true, data: billerCache };
  }

  type GetBillersResp = {
    category?: string;
    categoryName?: string;
    data?: Array<{ billerId: string; billerName: string }>;
  };

  const r = await ccPost<GetBillersResp>("/ccBillPay/getBillers", {
    merchantId: merchantId(),
    categoryKey: CATEGORY_KEY,
  });

  if (!r.ok) {
    log.warn({ code: r.code, message: r.message }, "Chagans CC getBillers failed");
    return r as PartnerResult<ChagansCcBiller[]>;
  }

  const billers: ChagansCcBiller[] = (r.data.data ?? []).map((b) => ({
    billerId: b.billerId,
    billerName: b.billerName,
  }));

  billerCache = billers;
  billerCacheAt = Date.now();
  log.info({ count: billers.length }, "Chagans CC biller cache refreshed");

  return { ok: true, data: billers, raw: r.raw };
}

// ---------------------------------------------------------------------------
// 2. getBillerParams
// ---------------------------------------------------------------------------

/**
 * Get the required input fields for a specific biller AND obtain an enquiryId.
 *
 * IMPORTANT: the enquiryId returned here is the session token for BOTH the
 * subsequent fetchBill AND payBill calls. It is valid for 30 minutes. The UI
 * must store it alongside a timestamp and warn/block if it expires before pay.
 */
export async function chagansCcGetBillerParams(
  billerId: string
): Promise<PartnerResult<ChagansCcBillerParamsResult>> {
  type GetParamsResp = {
    enquiryId?: string;
    data?: {
      requiredFields?: Array<{ paramName: string; dataType: string }>;
      billerName?: string;
    };
  };

  const r = await ccPost<GetParamsResp>("/ccBillPay/getBillersParams", {
    categoryKey: CATEGORY_KEY,
    merchantId: merchantId(),
    billerId,
  });

  if (!r.ok) {
    log.warn(
      { code: r.code, message: r.message, billerId },
      "Chagans CC getBillerParams failed"
    );
    return r as PartnerResult<ChagansCcBillerParamsResult>;
  }

  // enquiryId is at the root of the response (not inside data).
  const enquiryId = r.data.enquiryId;
  if (!enquiryId) {
    return {
      ok: false,
      code: "MISSING_ENQUIRY_ID",
      message:
        "Biller params response did not include an enquiryId — cannot proceed",
      raw: r.raw,
    };
  }

  return {
    ok: true,
    data: {
      requiredFields: r.data.data?.requiredFields ?? [],
      billerName: r.data.data?.billerName ?? "",
      enquiryId,
    },
    raw: r.raw,
  };
}

// ---------------------------------------------------------------------------
// 3. fetchBill
// ---------------------------------------------------------------------------

/**
 * Try to extract a due amount (₹) from the raw billerResponse.
 * Chagans BBPS billerResponse shape varies by issuer; check the most common keys.
 */
function extractDueAmount(br: Record<string, unknown>): number | null {
  const candidates = [
    "dueAmount",
    "amount",
    "billAmount",
    "totalAmount",
    "outstandingAmount",
    "statementBalance",
    "minAmount",
    "totalDue",
  ];
  for (const k of candidates) {
    const v = br[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v)) && Number(v) > 0)
      return Number(v);
  }
  return null;
}

/**
 * Fetch bill details using the enquiryId and the consumer input parameters.
 *
 * `parameters` keys follow BBPS positional naming: { param1: "value", param2: "value" }.
 * The order must match the `requiredFields` array from getBillerParams.
 */
export async function chagansCcFetchBill(input: {
  billerId: string;
  enquiryId: string;
  parameters: Record<string, string>; // { param1: "...", param2: "..." }
}): Promise<PartnerResult<ChagansCcFetchBillResult>> {
  type FetchBillResp = {
    data?: {
      billerResponse?: Record<string, unknown>;
      additionalInfo?: Record<string, unknown>;
    };
  };

  const r = await ccPost<FetchBillResp>("/ccBillPay/fetchBill", {
    merchantId: merchantId(),
    categoryKey: CATEGORY_KEY,
    billerId: input.billerId,
    enquiryId: input.enquiryId,
    parameters: input.parameters,
  });

  if (!r.ok) {
    log.warn(
      { code: r.code, message: r.message, billerId: input.billerId },
      "Chagans CC fetchBill failed"
    );
    return r as PartnerResult<ChagansCcFetchBillResult>;
  }

  const billerResponse = r.data.data?.billerResponse ?? {};
  const additionalInfo = r.data.data?.additionalInfo ?? {};

  return {
    ok: true,
    data: {
      billerResponse,
      additionalInfo,
      message: r.data.message ?? "Bill fetched successfully",
      dueAmount: extractDueAmount(billerResponse),
    },
    raw: r.raw,
  };
}

// ---------------------------------------------------------------------------
// 4. payBill
// ---------------------------------------------------------------------------

/** Normalise Chagans' status token to our canonical uppercase form. */
function normaliseCcStatus(raw: string | undefined): ChagansCcPayResult["status"] {
  const s = (raw ?? "").trim().toLowerCase();
  if (
    s === "success" ||
    s === "successful" ||
    s === "completed" ||
    s === "complete" ||
    s === "approved"
  )
    return "SUCCESS";
  if (
    s === "failed" ||
    s === "failure" ||
    s === "declined" ||
    s === "rejected" ||
    s === "cancelled" ||
    s === "canceled"
  )
    return "FAILED";
  // "pending", "processing", "initiated", or any unknown → PENDING
  return "PENDING";
}

/**
 * Pay the bill.
 *
 * Uses the SAME enquiryId obtained from getBillerParams (not from fetchBill).
 * `externalRef` is our idempotency key (persisted in Transaction.request for
 * reconciliation). `customerPan` is optional — send empty string when unknown.
 *
 * CRITICAL: The response is synchronous. Do NOT retry on timeout — money may
 * already have moved. The transaction stays PROCESSING for recon on timeout.
 */
export async function chagansCcPayBill(input: {
  billerId: string;
  enquiryId: string;
  amount: number;
  externalRef: string;
  customerPan?: string;
}): Promise<PartnerResult<ChagansCcPayResult>> {
  log.info(
    {
      billerId: input.billerId,
      amount: input.amount,
      externalRef: input.externalRef,
    },
    "Chagans CC payBill initiated"
  );

  type PayBillResp = {
    data?: {
      transactionId?: string;
      status?: string;
    };
  };

  const r = await ccPost<PayBillResp>("/ccBillPay/payBill", {
    merchantId: merchantId(),
    categoryKey: CATEGORY_KEY,
    billerId: input.billerId,
    enquiryId: input.enquiryId,
    amount: String(input.amount), // Chagans expects a string value
    externalRef: input.externalRef,
    customerPan: input.customerPan ?? "",
  });

  if (!r.ok) {
    log.warn(
      { code: r.code, message: r.message, billerId: input.billerId, externalRef: input.externalRef },
      "Chagans CC payBill failed"
    );
    return r as PartnerResult<ChagansCcPayResult>;
  }

  const transactionId = r.data.data?.transactionId ?? "";
  const status = normaliseCcStatus(r.data.data?.status);

  log.info(
    { transactionId, status, billerId: input.billerId, externalRef: input.externalRef },
    "Chagans CC payBill response"
  );

  if (status === "FAILED") {
    return {
      ok: false,
      code: "PAYMENT_FAILED",
      message: r.data.message ?? "Credit card bill payment failed",
      raw: r.raw,
    };
  }

  return {
    ok: true,
    data: { transactionId, status, message: r.data.message ?? "" },
    partnerTxnId: transactionId || input.externalRef,
    pending: status === "PENDING",
    raw: r.raw,
  };
}

// ---------------------------------------------------------------------------
// 5. checkStatus — POST /bbps/checkStatus
// ---------------------------------------------------------------------------

/** Normalise a Chagans status-check status token. Includes "refunded". */
function normaliseCheckStatus(raw: string | undefined): ChagansCcStatusResult["status"] {
  const s = (raw ?? "").trim().toLowerCase();
  if (
    s === "success" ||
    s === "successful" ||
    s === "completed" ||
    s === "complete" ||
    s === "approved" ||
    s === "paid"
  )
    return "SUCCESS";
  if (s === "refunded" || s === "reversed" || s === "refund")
    return "REFUNDED";
  if (
    s === "failed" ||
    s === "failure" ||
    s === "declined" ||
    s === "rejected" ||
    s === "cancelled" ||
    s === "canceled"
  )
    return "FAILED";
  return "PENDING";
}

/**
 * Check the status of a CC Bill Pay transaction.
 *
 * Endpoint:  POST /bbps/checkStatus   (note: /bbps/ prefix, NOT /ccBillPay/)
 * Body:      { orderId: "<Chagans transactionId from payBill>" }
 *
 * Used by:
 *   - BBPS recon sweep (PROCESSING transactions with partner CHAGANS_CC_BILL)
 *   - Admin "Resolve / verify with provider" action
 *   - Manual /status route for ops troubleshooting
 *
 * Response shape is parsed defensively since Chagans did not provide a sample.
 * We look for the status in common fields: status, data.status, result,
 * data.result, etc.
 */
export async function chagansCcCheckStatus(
  orderId: string
): Promise<PartnerResult<ChagansCcStatusResult>> {
  if (!orderId) {
    return {
      ok: false,
      code: "BAD_PARAMS",
      message: "checkStatus requires an orderId (Chagans transactionId)",
    };
  }

  log.info({ orderId }, "Chagans CC checkStatus initiated");

  type StatusResp = {
    data?: {
      status?: string;
      result?: string;
      orderId?: string;
      transactionId?: string;
      amount?: string | number;
    };
    status?: string;
    result?: string;
  };

  const r = await ccPost<StatusResp>("/bbps/checkStatus", {
    orderId,
  });

  if (!r.ok) {
    log.warn(
      { code: r.code, message: r.message, orderId },
      "Chagans CC checkStatus failed"
    );
    return r as PartnerResult<ChagansCcStatusResult>;
  }

  // Extract status from the deepest usable field. Chagans may return the status
  // at top-level or nested inside `data` — check both.
  const rawStatus =
    r.data.data?.status ??
    r.data.data?.result ??
    r.data.status ??
    r.data.result;

  const status = normaliseCheckStatus(rawStatus);

  // Extract amount (may be string or number).
  let amount: number | undefined;
  const rawAmt = r.data.data?.amount;
  if (rawAmt !== undefined && rawAmt !== null) {
    const n = typeof rawAmt === "number" ? rawAmt : Number(rawAmt);
    if (Number.isFinite(n) && n > 0) amount = n;
  }

  const resolvedOrderId =
    r.data.data?.orderId ??
    r.data.data?.transactionId ??
    orderId;

  log.info(
    { orderId, resolvedOrderId, status, amount },
    "Chagans CC checkStatus response"
  );

  return {
    ok: true,
    data: {
      orderId: resolvedOrderId,
      status,
      amount,
      message: r.data.message,
    },
    raw: r.raw,
  };
}
