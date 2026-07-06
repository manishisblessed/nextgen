/**
 * Leegality eSigning Gateway v3 adapter — partner agreement execution.
 *
 * Activate: PARTNER_ESIGN_ENABLED=true  (flags.esign)
 *   needs: LEEGALITY_AUTH_TOKEN   (dashboard → API token, sent as X-Auth-Token)
 *          LEEGALITY_PROFILE_ID   (published workflow profile id)
 *   opt:   LEEGALITY_BASE_URL     sandbox: https://sandbox.leegality.com/api
 *                                 prod:    https://app1.leegality.com/api
 *
 * Flow: create sign request (profileId + invitees [+ base64 PDF for PDF-type
 * workflows]) → invitee signs via signUrl → track via document details or the
 * webhook. Webhook payloads are NEVER trusted directly — we re-fetch the
 * document details server-side with our token before acting.
 */
import { env } from "@/lib/env";
import type { PartnerResult } from "./types";

export function leegalityConfigured(): boolean {
  return Boolean(env.LEEGALITY_AUTH_TOKEN && env.LEEGALITY_PROFILE_ID);
}

function baseUrl(): string {
  return (env.LEEGALITY_BASE_URL || "https://sandbox.leegality.com/api").replace(/\/+$/, "");
}

function authToken(): string {
  const t = env.LEEGALITY_AUTH_TOKEN;
  if (!t) throw new Error("[leegality] LEEGALITY_AUTH_TOKEN is not configured");
  return t;
}

/**
 * Leegality envelope: `status` 1 = success, 0 = failure; human messages in
 * `messages[]`.
 */
type LeegalityEnvelope<T> = {
  status?: number;
  messages?: Array<{ code?: string; message?: string }>;
  data?: T;
};

async function leegalityRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<PartnerResult<T>> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        "X-Auth-Token": authToken(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as LeegalityEnvelope<T>;
    if (!res.ok || json.status === 0) {
      const first = json.messages?.[0];
      return {
        ok: false,
        code: first?.code || `HTTP_${res.status}`,
        message: first?.message || res.statusText || "Leegality request failed",
        raw: json,
      };
    }
    return { ok: true, data: (json.data ?? (json as unknown)) as T, raw: json };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: (e as Error).message };
  }
}

// ---------- create ----------

export type EsignInvitee = { name: string; email?: string; phone?: string };

export type EsignRequestOutput = {
  documentId: string;
  invitees: Array<EsignInvitee & { signUrl?: string }>;
};

type CreateResponse = {
  documentId?: string;
  invitees?: Array<{ name?: string; email?: string; phone?: string; signUrl?: string }>;
};

/**
 * Create an eSigning request against the configured workflow profile.
 * For PDF-type workflows pass `file` (base64, no data: prefix). `irn` is our
 * internal reference (we use the Invite id) echoed back in webhooks/details.
 */
export async function createEsignRequest(input: {
  invitees: EsignInvitee[];
  irn: string;
  file?: { name: string; base64: string };
  profileId?: string;
}): Promise<PartnerResult<EsignRequestOutput>> {
  const profileId = input.profileId || env.LEEGALITY_PROFILE_ID;
  if (!profileId) {
    return { ok: false, code: "NOT_CONFIGURED", message: "LEEGALITY_PROFILE_ID is not set" };
  }
  const body: Record<string, unknown> = {
    profileId,
    invitees: input.invitees.map((i) => ({
      name: i.name,
      email: i.email ?? "",
      phone: i.phone ?? "",
    })),
    irn: input.irn,
  };
  if (input.file) body.file = { name: input.file.name, file: input.file.base64 };

  const r = await leegalityRequest<CreateResponse>("POST", "/v3.0/sign/request", body);
  if (!r.ok) return r;
  const documentId = r.data.documentId;
  if (!documentId) {
    return { ok: false, code: "NO_DOCUMENT_ID", message: "Leegality did not return a documentId", raw: r.raw };
  }
  return {
    ok: true,
    data: {
      documentId,
      invitees: (r.data.invitees ?? []).map((i) => ({
        name: i.name ?? "",
        email: i.email,
        phone: i.phone,
        signUrl: i.signUrl,
      })),
    },
    partnerTxnId: documentId,
    raw: r.raw,
  };
}

// ---------- details / files ----------

export type EsignDocumentDetails = {
  documentId: string;
  irn?: string;
  /** True once every invitee has signed. */
  completed: boolean;
  /** Coarse state derived from invitee signing progress. */
  status: "PENDING" | "PARTIALLY_SIGNED" | "COMPLETED" | "EXPIRED" | "DELETED";
  invitees: Array<{ name?: string; email?: string; phone?: string; signed?: boolean; signUrl?: string; expired?: boolean; rejected?: boolean }>;
  /** Short-lived CDN URLs (≈5 min) — download immediately, never store. */
  files?: string[];
  auditTrail?: string;
};

type DetailsResponse = {
  documentId?: string;
  irn?: string;
  requests?: Array<{ expired?: boolean; deleted?: boolean }>;
  invitations?: Array<{ name?: string; email?: string; phone?: string; signed?: boolean; active?: boolean; expired?: boolean; rejected?: boolean; signUrl?: string }>;
  files?: string[];
  auditTrail?: string;
};

/** Derive coarse status from Leegality's invitation list. Exported for tests. */
export function deriveEsignStatus(d: DetailsResponse): EsignDocumentDetails["status"] {
  const inv = d.invitations ?? [];
  const req = d.requests?.[0];
  if (req?.deleted) return "DELETED";
  const total = inv.length;
  const signed = inv.filter((i) => i.signed).length;
  if (total > 0 && signed === total) return "COMPLETED";
  if (req?.expired || inv.some((i) => i.expired)) return "EXPIRED";
  if (signed > 0) return "PARTIALLY_SIGNED";
  return "PENDING";
}

/**
 * Fetch document status (and optionally short-lived file/audit-trail URLs).
 * This is also how we verify webhook events — by documentId, with our token.
 */
export async function getEsignDetails(
  documentId: string,
  opts?: { withFile?: boolean; withAuditTrail?: boolean }
): Promise<PartnerResult<EsignDocumentDetails>> {
  const params = new URLSearchParams({ documentId });
  if (opts?.withFile) params.set("file", "true");
  if (opts?.withAuditTrail) params.set("auditTrail", "true");

  const r = await leegalityRequest<DetailsResponse>("GET", `/v3.3/document/details?${params}`);
  if (!r.ok) return r;
  const status = deriveEsignStatus(r.data);
  return {
    ok: true,
    data: {
      documentId: r.data.documentId || documentId,
      irn: r.data.irn,
      completed: status === "COMPLETED",
      status,
      invitees: (r.data.invitations ?? []).map((i) => ({
        name: i.name,
        email: i.email,
        phone: i.phone,
        signed: i.signed,
        signUrl: i.signUrl,
        expired: i.expired,
        rejected: i.rejected,
      })),
      files: r.data.files,
      auditTrail: r.data.auditTrail,
    },
    raw: r.raw,
  };
}

/** Re-send signing notifications for pending invitations. */
export async function resendEsignNotification(signUrls: string[]): Promise<PartnerResult<{ resent: boolean }>> {
  const r = await leegalityRequest<unknown>("POST", "/v3.0/sign/request/resend", { signUrls });
  if (!r.ok) return r;
  return { ok: true, data: { resent: true }, raw: r.raw };
}

/** Delete a document (e.g. invite cancelled before signing). */
export async function deleteEsignDocument(documentId: string): Promise<PartnerResult<{ deleted: boolean }>> {
  const r = await leegalityRequest<unknown>(
    "DELETE",
    `/v3.0/sign/request?documentId=${encodeURIComponent(documentId)}`
  );
  if (!r.ok) return r;
  return { ok: true, data: { deleted: true }, raw: r.raw };
}
