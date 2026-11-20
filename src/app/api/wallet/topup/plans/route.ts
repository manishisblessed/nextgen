import { NextResponse } from "next/server";
import type { Decimal } from "@prisma/client/runtime/library";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { flags } from "@/lib/env";
import { isServiceEnabledForUser } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { viableConfigured, viableChannelHealth, hydrateHealthCache } from "@/lib/partners/viable-pg";
import { chagansConfigured, chagansChannelHealth } from "@/lib/partners/chagans-pg";
import { readGatewayHealth } from "@/lib/ops/telemetry";
import { resolveUserScheme } from "@/lib/scheme/resolve-scheme";
import { pgMdrScopeKey } from "@/lib/wallet/topup";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PAYMENT_MODES = ["CREDIT", "DEBIT", "PREPAID", "BUSINESS"] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];

// Static partner bank metadata per channel — reflects each gateway's acquiring network.
const CHANNEL_BANKS: Record<string, string[]> = {
  "chagans:comet": ["SBI", "HDFC", "ICICI", "AXIS", "Kotak", "IDFC", "RBL", "Indus", "Yes Bank", "AU Bank"],
  "chagans:star": ["SBI", "HDFC", "ICICI", "IDFC", "RBL", "BOB", "AU Bank"],
  "viable:razorpay1": ["AXIS", "Kotak", "IDFC", "RBL", "BOB"],
  "viable:razorpay2": ["AXIS", "Kotak", "IDFC", "RBL", "BOB"],
  "viable:razorpay4": ["AXIS", "Kotak", "RBL", "Indus", "Yes Bank", "AU Bank"],
  "viable:razorpay5": ["AXIS", "Kotak", "IDFC", "RBL", "BOB"],
  "viable:premimumpg3": ["SBI", "HDFC", "ICICI", "AXIS", "Kotak", "IDFC", "RBL", "Indus", "Yes Bank", "AU Bank"],
};

type ModeRate = {
  mode: PaymentMode;
  display: string; // e.g. "1.4406 % + GST"
};

export type GatewayPlan = {
  id: string;
  label: string;
  provider: string;
  settlementType: "T0" | "T1";
  primary: boolean;
  healthy: boolean;
  detail: string;
  checkedAt: string | null;
  maxAmount: number | null;
  rates: ModeRate[];
  banks: string[];
  bestValue: boolean;
};

type NumLike = Decimal | number | string;
type SlabRow = {
  paymentMode: string | null;
  company: string | null;
  mdrType: string;
  mdrValue: NumLike;
  mdrValueT0: NumLike | null;
  minAmount: NumLike;
  maxAmount: NumLike;
};

/** Format a rate value as a display string. */
function formatRate(mdrType: string, value: number): string {
  if (mdrType === "PERCENT") {
    const pct = value * 100;
    // Show up to 4 significant decimal places, trailing zeros stripped
    const formatted = pct.toFixed(4).replace(/\.?0+$/, "");
    return `${formatted} % + GST`;
  }
  return `₹${value.toFixed(2)} flat`;
}

/** Pick the best matching MDR slab for a given scope + payment mode at a base amount. */
function pickRate(
  slabs: SlabRow[],
  scopeKey: string,
  mode: PaymentMode,
  baseAmount = 10000
): ModeRate {
  const eligible = slabs.filter((s) => {
    const compWild = !s.company || s.company === "" || s.company === "*";
    const compMatch = compWild || s.company === scopeKey;
    const modeWild = !s.paymentMode || s.paymentMode === "" || s.paymentMode === "*";
    const modeMatch = modeWild || s.paymentMode === mode;
    const inBand = Number(s.minAmount) <= baseAmount && Number(s.maxAmount) >= baseAmount;
    return compMatch && modeMatch && inBand;
  });

  if (!eligible.length) return { mode, display: "On request" };

  // Most specific first: exact company + exact mode wins over wildcards
  eligible.sort((a, b) => {
    const sa = (a.company === scopeKey ? 2 : 0) + (a.paymentMode === mode ? 1 : 0);
    const sb = (b.company === scopeKey ? 2 : 0) + (b.paymentMode === mode ? 1 : 0);
    return sb - sa;
  });

  const slab = eligible[0];
  // T0 rate for PG top-ups (same-day settlement); fall back to T1
  const rawVal = Number(slab.mdrValueT0) > 0 ? Number(slab.mdrValueT0) : Number(slab.mdrValue);
  return { mode, display: formatRate(slab.mdrType, rawVal) };
}

export async function GET() {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`wallet:topup:plans:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  if (!flags.upi) return NextResponse.json({ plans: [] });

  if (
    user.role !== "RETAILER" ||
    !(await isServiceEnabledForUser(SERVICE_KEYS.PG, user.id, user.role))
  ) {
    return NextResponse.json({ plans: [] });
  }

  try {
    // Gather channels (same logic as /channels)
    type RawChannel = {
      id: string;
      label: string;
      provider: string;
      primary: boolean;
      healthy: boolean;
      detail: string;
      checkedAt: string | null;
      maxAmount?: number;
      scopeKey: string;
      settlementType: "T0" | "T1";
    };

    const rawChannels: RawChannel[] = [];
    const chagansOn = chagansConfigured();

    if (viableConfigured() && !chagansOn) {
      hydrateHealthCache(await readGatewayHealth());
      const viable = await viableChannelHealth(false);
      for (const c of viable) {
        rawChannels.push({
          id: `viable:${c.id}`,
          label: c.label,
          provider: "VIABLE_PG",
          primary: c.primary,
          healthy: c.healthy,
          detail: c.detail,
          checkedAt: c.checkedAt,
          scopeKey: pgMdrScopeKey("VIABLE_PG", c.id),
          settlementType: "T0",
        });
      }
    }

    if (chagansOn) {
      const viablePresent = rawChannels.length > 0;
      for (const c of chagansChannelHealth()) {
        rawChannels.push({
          id: `chagans:${c.id}`,
          label: c.label,
          provider: "CHAGANS_PG",
          primary: viablePresent ? false : c.primary,
          healthy: c.healthy,
          detail: c.detail,
          checkedAt: c.checkedAt,
          maxAmount: c.maxAmount,
          scopeKey: pgMdrScopeKey("CHAGANS_PG", c.id),
          // Comet = T1 (next-day), Star = T0 (same-day)
          settlementType: c.id === "comet" ? "T1" : "T0",
        });
      }
    }

    // Dedup primary (first wins)
    let seenPrimary = false;
    for (const c of rawChannels) {
      if (c.primary && !seenPrimary) seenPrimary = true;
      else c.primary = false;
    }

    // Fetch user's scheme slabs for PG (all at once, filter per channel below)
    const { schemeId } = await resolveUserScheme(user.id);
    let slabs: SlabRow[] = [];
    if (schemeId) {
      slabs = await prisma.mdrSlab.findMany({
        where: { schemeId, serviceKind: "PG", active: true },
        select: {
          paymentMode: true,
          company: true,
          mdrType: true,
          mdrValue: true,
          mdrValueT0: true,
          minAmount: true,
          maxAmount: true,
        },
      });
    }

    // Build plan cards
    const plans: GatewayPlan[] = rawChannels.map((c) => ({
      id: c.id,
      label: c.label,
      provider: c.provider,
      settlementType: c.settlementType,
      primary: c.primary,
      healthy: c.healthy,
      detail: c.detail,
      checkedAt: c.checkedAt,
      maxAmount: c.maxAmount ?? null,
      rates: PAYMENT_MODES.map((m) => pickRate(slabs, c.scopeKey, m)),
      banks: CHANNEL_BANKS[c.id] ?? [],
      bestValue: c.primary,
    }));

    return NextResponse.json({ plans });
  } catch (e) {
    return toErrorResponse(e);
  }
}
