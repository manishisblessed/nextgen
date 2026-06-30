import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { issueSubmitNonce } from "@/lib/security/submitNonce";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";

// Authenticated, never cached. Mints a short-TTL single-use submit nonce the
// browser attaches to sensitive form POSTs (x-submit-nonce) for replay defense.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`submit-nonce:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json(
        { error: e.message, retryAfterSec: e.result.retryAfterSec },
        { status: 429 }
      );
    throw e;
  }

  const { nonce, expiresAt } = await issueSubmitNonce(user.id);
  return NextResponse.json({ nonce, expiresAt });
}
