import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getPartner } from "@/lib/partners";
import { viableChannelHealth, hydrateHealthCache } from "@/lib/partners/viable-pg";
import { readGatewayHealth } from "@/lib/ops/telemetry";

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
    // mint ₹1 probe orders at will. Seed from the worker's shared snapshot first
    // (so a cold web instance shows the worker's health without probing), then
    // fall back to a single cold probe only if nothing is cached at all.
    hydrateHealthCache(await readGatewayHealth());
    const channels = await viableChannelHealth(false);
    return NextResponse.json({ provider: "VIABLE_PG", channels });
  } catch (e) {
    return toErrorResponse(e);
  }
}
