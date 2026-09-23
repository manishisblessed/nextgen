import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getPartner } from "@/lib/partners";
import { viableChannelHealth } from "@/lib/partners/viable-pg";

/**
 * PG gateway channels + live health for the wallet "add money" selector.
 *
 * Returns the list of Viable PG gateways the user can pay through, each flagged
 * healthy/unhealthy (probed + cached in-process) so a down gateway is shown as
 * unavailable and the user doesn't waste time on it. Only meaningful when the
 * active UPI provider is Viable PG; other providers return an empty list (the
 * UI then hides the selector and uses the default gateway).
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`wallet:topup:channels:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  // Only Viable PG exposes multiple selectable gateways. If it isn't the active
  // provider, return an empty list so the UI falls back to a single gateway.
  const upi = getPartner("upi");
  if (upi.name !== "VIABLE_PG") {
    return NextResponse.json({ provider: upi.name, channels: [] });
  }

  try {
    // No user-triggered force re-probe: an on-demand `force` would let any user
    // mint ₹1 probe orders at will. The short in-process cache (warmed by real
    // traffic + the pg.health worker sweep) is authoritative; a cold cache
    // probes once and caches, which is enough to render accurate availability.
    const channels = await viableChannelHealth(false);
    return NextResponse.json({ provider: "VIABLE_PG", channels });
  } catch (e) {
    return toErrorResponse(e);
  }
}
