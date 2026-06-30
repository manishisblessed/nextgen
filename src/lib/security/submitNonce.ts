import { nanoid } from "nanoid";
import { prisma } from "../db";

/**
 * Short-TTL, single-use submit nonces for sensitive forms.
 *
 * A cache-deception / replay attacker who captures a state-changing POST can
 * resend it. `Idempotency-Key` (ledger / src/lib/idempotency.ts) already makes
 * money moves safe against accidental retries, and this adds a second,
 * orthogonal layer for browser-driven sensitive forms: the page mints a nonce
 * (GET /api/security/nonce), submits it in the `x-submit-nonce` header, and the
 * server CONSUMES it atomically. A replayed request carries an already-consumed
 * nonce, so it is rejected outright — the action cannot repeat.
 *
 * Backed by the existing IdempotencyKey table (scope "submit-nonce"); no new
 * model needed. Consumption is a single atomic DELETE, so even concurrent
 * replays can only succeed once.
 */

export const SUBMIT_NONCE_HEADER = "x-submit-nonce";
const SCOPE = "submit-nonce";
const DEFAULT_TTL_SEC = 10 * 60; // 10 minutes

export class SubmitNonceError extends Error {
  public statusCode = 400;
  constructor(message = "Missing or invalid submit nonce. Please reload and try again.") {
    super(message);
    this.name = "SubmitNonceError";
  }
}

/** Mint a fresh single-use nonce bound to a user. Returns the opaque token. */
export async function issueSubmitNonce(
  userId: string,
  ttlSec = DEFAULT_TTL_SEC
): Promise<{ nonce: string; expiresAt: string }> {
  const token = `sn_${nanoid(32)}`;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  await prisma.idempotencyKey.create({
    data: {
      id: nanoid(),
      key: `${SCOPE}:${token}`,
      scope: SCOPE,
      userId,
      status: "IN_PROGRESS",
      expiresAt,
    },
  });
  return { nonce: token, expiresAt: expiresAt.toISOString() };
}

/**
 * Atomically consume a nonce. Returns true if a fresh, unexpired nonce owned by
 * `userId` was found and consumed; false otherwise. Never throws.
 */
export async function consumeSubmitNonce(userId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const compositeKey = `${SCOPE}:${token}`;
  // Single-statement delete = atomic one-time use. Scope to the owner and
  // require it to be unexpired so a stale/foreign nonce can never be redeemed.
  const res = await prisma.idempotencyKey.deleteMany({
    where: {
      key: compositeKey,
      scope: SCOPE,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return res.count > 0;
}

/**
 * Enforce a submit nonce on a browser (cookie-session) request and throw
 * {@link SubmitNonceError} when it is missing/invalid/replayed.
 *
 * Bearer-token (mobile / server-to-server) callers are exempt: they don't run
 * the browser form flow and already protect against replay with their own
 * `Idempotency-Key`. This keeps existing API/mobile behavior intact while
 * hardening the web forms.
 */
export async function requireSubmitNonce(req: Request, userId: string): Promise<void> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return;
  const token = req.headers.get(SUBMIT_NONCE_HEADER);
  const ok = await consumeSubmitNonce(userId, token);
  if (!ok) throw new SubmitNonceError();
}
