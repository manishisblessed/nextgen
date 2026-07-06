import crypto from "crypto";
import type { ApiKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enforceRateLimit } from "@/lib/security/rateLimit";

/**
 * Partner API keys (Phase 4 — platform play).
 *
 * Key format:  Authorization: Bearer <keyId>.<secret>
 *   keyId  — public identifier, `ngp_live_…` (safe to log/display)
 *   secret — 32 random bytes, shown exactly once at creation; only its
 *            SHA-256 digest is stored, so a DB leak never leaks live keys.
 *
 * Verification is scope-based (least privilege) with an optional per-key IP
 * allowlist and a per-key rate limit. All failures raise ApiKeyError with an
 * HTTP status — the v1 routes map it straight to a response.
 */

export const API_SCOPES = [
  { id: "wallet.read", label: "Read wallet balance" },
  { id: "txn.read", label: "Read transactions" },
  { id: "payout.read", label: "Read payout status" },
  { id: "payout.create", label: "Create payouts (maker-checker still applies)" },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["id"];

const SCOPE_IDS = new Set<string>(API_SCOPES.map((s) => s.id));

export class ApiKeyError extends Error {
  constructor(
    message: string,
    public statusCode = 401,
    public code = "UNAUTHORIZED"
  ) {
    super(message);
  }
}

export function hashApiSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function isValidScope(scope: string): scope is ApiScope {
  return SCOPE_IDS.has(scope);
}

/** Generate a key pair. The secret is returned ONCE and never stored. */
export function generateApiKeyPair(): { keyId: string; secret: string } {
  return {
    keyId: `ngp_live_${crypto.randomBytes(9).toString("base64url")}`,
    secret: crypto.randomBytes(32).toString("base64url"),
  };
}

/** Parse `Authorization: Bearer <keyId>.<secret>`; null when absent/malformed. */
export function parseApiKeyHeader(header: string | null): { keyId: string; secret: string } | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  // keyId contains no dots; the first dot separates it from the secret.
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const keyId = token.slice(0, dot);
  if (!keyId.startsWith("ngp_")) return null;
  return { keyId, secret: token.slice(dot + 1) };
}

export type ApiKeyContext = {
  apiKey: Pick<ApiKey, "id" | "keyId" | "label" | "scopes" | "userId">;
  user: { id: string; name: string; role: string; status: string };
};

/**
 * Authenticate a partner API request and enforce the required scopes.
 * Constant-time hash comparison; revoked keys and non-ACTIVE users fail closed.
 */
export async function requireApiKey(req: Request, scopes: ApiScope[]): Promise<ApiKeyContext> {
  const parsed = parseApiKeyHeader(req.headers.get("authorization"));
  if (!parsed) {
    throw new ApiKeyError("Missing or malformed Authorization header (expected: Bearer <keyId>.<secret>)");
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyId: parsed.keyId },
    include: { user: { select: { id: true, name: true, role: true, status: true } } },
  });
  if (!key) throw new ApiKeyError("Unknown API key");
  if (key.revokedAt) throw new ApiKeyError("API key has been revoked", 401, "KEY_REVOKED");

  const given = Buffer.from(hashApiSecret(parsed.secret), "hex");
  const stored = Buffer.from(key.secretHash, "hex");
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    throw new ApiKeyError("Invalid API key secret");
  }

  if (key.user.status !== "ACTIVE") {
    throw new ApiKeyError("Account is not active", 403, "ACCOUNT_INACTIVE");
  }

  if (key.ipAllowlist.length > 0) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    if (!ip || !key.ipAllowlist.includes(ip)) {
      throw new ApiKeyError(`Request IP ${ip || "unknown"} is not in this key's allowlist`, 403, "IP_NOT_ALLOWED");
    }
  }

  for (const s of scopes) {
    if (!key.scopes.includes(s)) {
      throw new ApiKeyError(`API key lacks the required scope: ${s}`, 403, "INSUFFICIENT_SCOPE");
    }
  }

  // Per-key rate limit — separate budget from the owner's interactive session.
  await enforceRateLimit(`apikey:${key.keyId}`, { limit: 120, windowSec: 60 });

  // Best-effort usage stamp; never blocks the request.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    apiKey: { id: key.id, keyId: key.keyId, label: key.label, scopes: key.scopes, userId: key.userId },
    user: key.user,
  };
}
