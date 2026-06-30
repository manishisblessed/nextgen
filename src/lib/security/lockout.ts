import { prisma } from "../db";
import { securityLogger } from "../logger";

/**
 * Account lockout with exponential backoff, keyed by the normalized login
 * identifier (email/phone). Works alongside the IP/identifier rate limiter
 * (rateLimit.ts) but persists across windows so an attacker cannot simply wait
 * out a single rate-limit bucket.
 *
 * Policy:
 *   - First {@link LOCKOUT_THRESHOLD} failures: no lock (normal typos).
 *   - Each failure at/after the threshold locks the identifier for an
 *     exponentially growing duration, capped at {@link MAX_LOCK_SEC}.
 *   - A successful login clears the counter.
 *
 * We key on the identifier (not the userId) so a non-existent account is
 * throttled identically to a real one — denying attackers an enumeration oracle.
 */

export const LOCKOUT_THRESHOLD = 5;
const BASE_LOCK_SEC = 30; // first lock duration once threshold is crossed
const MAX_LOCK_SEC = 60 * 60; // cap at 1 hour
/** Counter resets to 0 if the last failure was longer ago than this. */
const COUNTER_TTL_SEC = 60 * 60;

export class AccountLockedError extends Error {
  public statusCode = 423; // Locked
  constructor(public retryAfterSec: number) {
    super("Account temporarily locked due to repeated failed logins");
    this.name = "AccountLockedError";
  }
}

export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function backoffSeconds(failedCount: number): number {
  const overage = Math.max(0, failedCount - LOCKOUT_THRESHOLD);
  const secs = BASE_LOCK_SEC * 2 ** overage;
  return Math.min(secs, MAX_LOCK_SEC);
}

/** Throw {@link AccountLockedError} if the identifier is currently locked. */
export async function assertNotLocked(identifier: string): Promise<void> {
  const id = normalizeIdentifier(identifier);
  const row = await prisma.loginAttempt.findUnique({ where: { identifier: id } });
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    const retryAfterSec = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 1000);
    throw new AccountLockedError(retryAfterSec);
  }
}

export type FailedLoginResult = {
  failedCount: number;
  locked: boolean;
  lockedUntil: Date | null;
};

/**
 * Record a failed login. Increments the counter (resetting first if the prior
 * failure has aged out) and applies an exponential lock once the threshold is
 * crossed. Returns the resulting state for logging.
 */
export async function recordFailedLogin(
  identifier: string,
  ip?: string | null
): Promise<FailedLoginResult> {
  const id = normalizeIdentifier(identifier);
  const now = new Date();

  const existing = await prisma.loginAttempt.findUnique({ where: { identifier: id } });
  const aged =
    existing?.lastFailedAt &&
    now.getTime() - existing.lastFailedAt.getTime() > COUNTER_TTL_SEC * 1000;

  const failedCount = (aged ? 0 : existing?.failedCount ?? 0) + 1;
  const locked = failedCount >= LOCKOUT_THRESHOLD;
  const lockedUntil = locked ? new Date(now.getTime() + backoffSeconds(failedCount) * 1000) : null;

  await prisma.loginAttempt.upsert({
    where: { identifier: id },
    create: {
      identifier: id,
      failedCount,
      lastFailedAt: now,
      lastIp: ip ?? null,
      lockedUntil,
    },
    update: {
      failedCount,
      lastFailedAt: now,
      lastIp: ip ?? null,
      lockedUntil,
    },
  });

  if (locked) {
    securityLogger.warn({
      action: "auth.account_locked",
      identifier: id,
      failedCount,
      ip: ip ?? undefined,
      lockedForSec: lockedUntil ? Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000) : 0,
    });
  }

  return { failedCount, locked, lockedUntil };
}

/** Clear the failed-login counter after a successful authentication. */
export async function recordSuccessfulLogin(identifier: string): Promise<void> {
  const id = normalizeIdentifier(identifier);
  await prisma.loginAttempt.deleteMany({ where: { identifier: id } });
}

/** Count of recent consecutive failures for an identifier (for anomaly flags). */
export async function recentFailureCount(identifier: string): Promise<number> {
  const id = normalizeIdentifier(identifier);
  const row = await prisma.loginAttempt.findUnique({ where: { identifier: id } });
  return row?.failedCount ?? 0;
}
