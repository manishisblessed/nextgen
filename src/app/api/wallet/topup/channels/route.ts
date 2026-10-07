import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { flags } from "@/lib/env";
import { isServiceEnabledForUser } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { viableConfigured, viableChannelHealth, hydrateHealthCache } from "@/lib/partners/viable-pg";
import { chagansConfigured, chagansChannelHealth } from "@/lib/partners/chagans-pg";
import { readGatewayHealth } from "@/lib/ops/telemetry";

/**
 * PG gateway channels + live health for the wallet "add money" selector.
 *
 * Returns a UNIFIED list across both live rails — Viable DigiSeva PG (multiple
 * gateways, actively health-probed) and Chagans PG (Comet + Star) — each flagged
 * healthy/unhealthy and carrying a globally-unique `<provider>:<gateway>` id the
 * client sends back as `channel`. A down gateway shows as unavailable so the
 * user doesn't waste time on it; the UI auto-selects the best healthy option.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

type UnifiedChannel = {
  id: string; // `<provider>:<gateway>`
  label: string;
  route: string;
  provider: string;
  primary: boolean;
  healthy: boolean;
  detail: string;
  checkedAt: string | null;
  maxAmount?: number;
};

export async function GET() {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`wallet:topup:channels:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  if (!flags.upi) return NextResponse.json({ provider: "NONE", channels: [] });

  // Payment Gateway top-up is retailer-only AND admin-gated (pg_razorpay). When
  // the caller is not an eligible retailer, return no channels so the "Add
  // money" selector stays hidden. The POST route enforces the same rules.
  if (
    user.role !== "RETAILER" ||
    !(await isServiceEnabledForUser(SERVICE_KEYS.PG, user.id, user.role))
  ) {
    return NextResponse.json({ provider: "NONE", channels: [] });
  }

  try {
    const channels: UnifiedChannel[] = [];

    // Payment Gateway now runs on Chagans (Comet + Star). Viable is kept in the
    // codebase only as a fallback for when Chagans is not configured — when
    // Chagans is live we surface ONLY its gateways (hide the Viable rails).
    const chagansOn = chagansConfigured();

    // Viable — actively probed; seed from the worker's shared snapshot first so
    // a cold web instance shows health without minting its own probe orders.
    if (viableConfigured() && !chagansOn) {
      hydrateHealthCache(await readGatewayHealth());
      const viable = await viableChannelHealth(false);
      for (const c of viable) {
        channels.push({
          id: `viable:${c.id}`,
          label: c.label,
          route: c.route,
          provider: "VIABLE_PG",
          primary: c.primary,
          healthy: c.healthy,
          detail: c.detail,
          checkedAt: c.checkedAt,
        });
      }
    }

    // Chagans — no health endpoint; "available" when configured, downgraded by a
    // recent real failure. Demote its primary when Viable is present so exactly
    // one overall primary remains.
    if (chagansOn) {
      const viablePresent = channels.length > 0;
      for (const c of chagansChannelHealth()) {
        channels.push({
          id: `chagans:${c.id}`,
          label: c.label,
          route: c.route,
          provider: "CHAGANS_PG",
          primary: viablePresent ? false : c.primary,
          healthy: c.healthy,
          detail: c.detail,
          checkedAt: c.checkedAt,
          maxAmount: c.maxAmount,
        });
      }
    }

    // Collapse to a single primary (first wins — Viable's primary when present,
    // else Chagans' Comet). The UI falls back to the first HEALTHY option anyway.
    let seenPrimary = false;
    for (const c of channels) {
      if (c.primary && !seenPrimary) seenPrimary = true;
      else c.primary = false;
    }

    const provider = [...new Set(channels.map((c) => c.provider))].join("+") || "NONE";
    return NextResponse.json({ provider, channels });
  } catch (e) {
    return toErrorResponse(e);
  }
}
