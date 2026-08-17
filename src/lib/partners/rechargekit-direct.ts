/**
 * RechargeKit (DIRECT) — "Offline CC Bill Payment" adapter.
 *
 * Unlike {@link ./sameday-rechargekit} (which proxies RechargeKit through the
 * Same Day Solution HMAC-signed transport), this adapter talks to the
 * RechargeKit API DIRECTLY:
 *
 *   Base URL : https://v2bapi.rechargkit.biz  (RECHARGEKIT_DIRECT_BASE_URL)
 *   Auth     : Authorization: Bearer {RECHARGEKIT_DIRECT_API_TOKEN}
 *
 * Two endpoints per the v3.0.0 integration guide:
 *   1. Operator List — GET  /recharge/servicewiseOperatorFetch?operator_category=11
 *   2. CC Payment    — POST /rkitcc/v3/ccPayment
 *
 * The retailer enters the FULL card number, IFSC, bank name, beneficiary name,
 * amount, and a transfer type (IMPS/NEFT). No bill-fetch step.
 *
 * Provider status codes: 1 = Success, 2 = Pending, 3 = Failed.
 *
 * Activate: PARTNER_RECHARGEKIT_DIRECT_ENABLED=true + RECHARGEKIT_DIRECT_API_TOKEN.
 *
 * CRITICAL: on pay timeout/network error, DO NOT blind-retry pay — the provider
 * may have already debited. The transaction stays PROCESSING for reconciliation.
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { PartnerResult } from "./types";

const log = logger.child({ module: "rechargekit-direct" });

/** Credit-card operator category in the RechargeKit operator taxonomy. */
const CC_OPERATOR_CATEGORY = "11";

/** IMPS / NEFT transfer types accepted by the CC payment API. */
export type RechargekitTransferType = "5" | "6"; // 5 = IMPS, 6 = NEFT

// In-memory operator cache — refreshed daily or on demand.
let operatorCache: RechargekitDirectOperator[] | null = null;
let operatorCacheAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type RechargekitDirectOperator = {
  operatorId: string;
  operatorName: string;
  operatorCode: string;
  serviceName?: string;
};

export type RechargekitDirectPayResult = {
  success: boolean;
  status: "SUCCESS" | "PENDING" | "FAILED";
  orderId: string;
  operatorReference?: string;
  amount: number;
  requestId: string;
  message?: string;
};

export function rechargekitDirectConfigured(): boolean {
  return Boolean(env.RECHARGEKIT_DIRECT_API_TOKEN);
}

function apiToken(): string {
  const token = env.RECHARGEKIT_DIRECT_API_TOKEN;
  if (!token)
    throw new Error(
      "[rechargekit-direct] RECHARGEKIT_DIRECT_API_TOKEN not configured"
    );
  return token;
}

function baseUrl(): string {
  return (env.RECHARGEKIT_DIRECT_BASE_URL || "https://v2bapi.rechargkit.biz").replace(
    /\/+$/,
    ""
  );
}

/** Map RechargeKit's numeric status (1/2/3) to our terminal state. */
function normalizeStatus(raw: unknown): RechargekitDirectPayResult["status"] {
  const code = Number(raw);
  if (code === 1) return "SUCCESS";
  if (code === 3) return "FAILED";
  return "PENDING"; // 2 (or anything unknown) = pending
}

type DirectRequestResult<T> = PartnerResult<T>;

/** Fire a direct Bearer-authenticated request to the RechargeKit API. */
async function directRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<DirectRequestResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken()}`,
    Accept: "application/json",
  };
  const bodyString = body !== undefined ? JSON.stringify(body) : undefined;
  if (bodyString) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: bodyString,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      error?: number | string;
      msg?: string;
    };
    // RechargeKit returns HTTP 200 with `error` != 0 for business failures.
    if (!res.ok) {
      return {
        ok: false,
        code: `HTTP_${res.status}`,
        message: json.msg || res.statusText || "RechargeKit request failed",
        raw: json,
      };
    }
    return { ok: true, data: json, raw: json };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

/** Fetch the CC operator list from RechargeKit directly (cached 24h). */
export async function rechargekitDirectOperators(
  forceRefresh = false
): Promise<PartnerResult<RechargekitDirectOperator[]>> {
  if (
    !forceRefresh &&
    operatorCache &&
    Date.now() - operatorCacheAt < CACHE_TTL_MS
  ) {
    return { ok: true, data: operatorCache };
  }

  const r = await directRequest<{
    error?: number | string;
    msg?: string;
    status?: number;
    operatorList?: Array<{
      operator_id: number | string;
      operator_name: string;
      service_name?: string;
      operator_category?: number | string;
      operator_category_name?: string;
    }>;
  }>("GET", `/recharge/servicewiseOperatorFetch?operator_category=${CC_OPERATOR_CATEGORY}`);

  if (!r.ok) return r;

  if (Number(r.data.error) !== 0) {
    return {
      ok: false,
      code: "OPERATOR_FETCH_FAILED",
      message: r.data.msg || "Could not fetch operator list",
      raw: r.raw,
    };
  }

  const operators: RechargekitDirectOperator[] = (r.data.operatorList ?? []).map(
    (op) => ({
      operatorId: String(op.operator_id),
      operatorName: op.operator_name,
      operatorCode: String(op.operator_id),
      serviceName: op.service_name,
    })
  );

  operatorCache = operators;
  operatorCacheAt = Date.now();
  log.info(
    { count: operators.length },
    "RechargeKit (direct) operators cache refreshed"
  );

  return { ok: true, data: operators, raw: r.raw };
}

/** Initiate a direct credit card payment via RechargeKit. */
export async function rechargekitDirectPay(input: {
  mobileNo: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  beneficiaryName: string;
  amount: number;
  transferType: RechargekitTransferType;
  operatorCode: string;
  partnerRequestId: string;
}): Promise<PartnerResult<RechargekitDirectPayResult>> {
  if (!/^\d{10}$/.test(input.mobileNo)) {
    return {
      ok: false,
      code: "INVALID_MOBILE",
      message: "Mobile number must be exactly 10 digits",
    };
  }
  if (!/^\d{13,19}$/.test(input.accountNo)) {
    return {
      ok: false,
      code: "INVALID_CARD",
      message: "Card number must be 13-19 digits",
    };
  }

  log.info(
    {
      mobileLast4: input.mobileNo.slice(-4),
      cardLast4: input.accountNo.slice(-4),
      amount: input.amount,
      operatorCode: input.operatorCode,
      transferType: input.transferType,
      partnerRequestId: input.partnerRequestId,
    },
    "RechargeKit (direct) pay initiated"
  );

  const r = await directRequest<{
    error?: number | string;
    msg?: string;
    status?: number;
    orderid?: string;
    optransid?: string;
    partnerreqid?: string;
  }>("POST", "/rkitcc/v3/ccPayment", {
    mobile_no: input.mobileNo,
    account_no: input.accountNo,
    ifsc: input.ifsc,
    bank_name: input.bankName,
    beneficiary_name: input.beneficiaryName,
    amount: String(input.amount),
    transfer_type: input.transferType,
    partner_request_id: input.partnerRequestId,
    operator_code: input.operatorCode,
  });

  if (!r.ok) {
    log.warn(
      { code: r.code, message: r.message, cardLast4: input.accountNo.slice(-4) },
      "RechargeKit (direct) pay failed"
    );
    return r;
  }

  const status = normalizeStatus(r.data.status);

  // A non-zero `error` with no pending/success state is a hard failure.
  if (Number(r.data.error) !== 0 && status === "FAILED") {
    return {
      ok: false,
      code: "PAYMENT_FAILED",
      message: r.data.msg || "Payment failed",
      raw: r.raw,
    };
  }

  const result: RechargekitDirectPayResult = {
    success: status !== "FAILED",
    status,
    orderId: r.data.orderid ?? "",
    operatorReference: r.data.optransid || undefined,
    amount: input.amount,
    requestId: r.data.partnerreqid ?? input.partnerRequestId,
    message: r.data.msg,
  };

  log.info(
    {
      orderId: result.orderId,
      requestId: result.requestId,
      status: result.status,
      amount: result.amount,
    },
    "RechargeKit (direct) pay response"
  );

  if (status === "FAILED") {
    return {
      ok: false,
      code: "PAYMENT_FAILED",
      message: result.message || "Payment failed",
      raw: r.raw,
    };
  }

  return {
    ok: true,
    data: result,
    partnerTxnId: result.orderId || result.requestId,
    pending: status === "PENDING",
    raw: r.raw,
  };
}
