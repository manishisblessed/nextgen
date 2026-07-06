/**
 * Same Day Solution — shared partner API transport.
 *
 * Used by the BBPS-2 (Pay2New) and Settlement adapters. The POS adapter
 * (sameday-pos.ts) predates this file and keeps its own copy of the same
 * scheme.
 *
 * Auth (every request):
 *   x-api-key    — partner API key
 *   x-signature  — HMAC-SHA256( api_secret, bodyString + timestamp )
 *                  where bodyString is the COMPACT JSON actually sent
 *                  (empty string for GET/DELETE)
 *   x-timestamp  — Unix timestamp in milliseconds
 *
 * Constraints: server IP must be whitelisted, timestamp within 5 minutes,
 * and the signature must be computed over the exact bytes sent — so we
 * JSON.stringify once and reuse that string for both signing and the body.
 */
import crypto from "crypto";
import { env } from "@/lib/env";
import type { PartnerResult } from "./types";

export type SamedayCredentials = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

/** HMAC-SHA256 hex signature over `bodyString + timestamp`. */
export function samedaySign(apiSecret: string, payload: string): string {
  return crypto.createHmac("sha256", apiSecret).update(payload).digest("hex");
}

export function samedayAuthHeaders(
  apiKey: string,
  apiSecret: string,
  bodyString: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  return {
    "x-api-key": apiKey,
    "x-signature": samedaySign(apiSecret, bodyString + timestamp),
    "x-timestamp": timestamp,
  };
}

export type SamedayError = {
  success: false;
  error?: { code?: string; message?: string };
  [k: string]: unknown;
};

/**
 * Fire a signed request. Same Day responses always carry `success`; business
 * failures can come back with HTTP 200 + success:false, so we normalize both.
 */
export async function samedayRequest<T extends { success?: boolean }>(
  creds: SamedayCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  query?: Record<string, string>
): Promise<PartnerResult<T>> {
  // Compact JSON — the server re-serializes and verifies against this form.
  const bodyString = body !== undefined ? JSON.stringify(body) : "";
  const headers: Record<string, string> = samedayAuthHeaders(
    creds.apiKey,
    creds.apiSecret,
    bodyString
  );
  if (bodyString) headers["Content-Type"] = "application/json";

  let url = `${creds.baseUrl.replace(/\/+$/, "")}${path}`;
  if (query) {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== "" && v != null)
    );
    if (params.toString()) url += `?${params}`;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & SamedayError;
    if (!res.ok || json.success === false) {
      return {
        ok: false,
        code: json.error?.code || `HTTP_${res.status}`,
        message: json.error?.message || res.statusText || "Same Day request failed",
        raw: json,
      };
    }
    return { ok: true, data: json, raw: json };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

/**
 * Resolve credentials for a Same Day product. Product-specific keys win;
 * otherwise we fall back to the POS keys since the admin panel issues one
 * key pair per partner account.
 */
export function samedayCredentials(
  product: "BBPS" | "SETTLEMENT"
): SamedayCredentials | null {
  const apiKey =
    (product === "BBPS" ? env.SAMEDAY_BBPS_API_KEY : env.SAMEDAY_SETTLEMENT_API_KEY) ||
    env.SAMEDAY_POS_API_KEY;
  const apiSecret =
    (product === "BBPS" ? env.SAMEDAY_BBPS_API_SECRET : env.SAMEDAY_SETTLEMENT_API_SECRET) ||
    env.SAMEDAY_POS_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { baseUrl: env.SAMEDAY_POS_BASE_URL, apiKey, apiSecret };
}
