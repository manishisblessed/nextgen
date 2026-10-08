import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { assertAccountActive } from "@/lib/security/accountGate";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { resolveUpiSelection } from "@/lib/partners";
import { priceSchemeSettlement } from "@/lib/settlement/engine";
import { isPgMdrProvider, pgMdrScopeKey } from "@/lib/wallet/topup";
import { round, toNumber } from "@/lib/money";

/**
 * Live top-up pricing quote.
 *
 * GET ?amount=<rupees>&gateway=<channelId>
 *   → { priceable: true, gross, mdr, net }  — the gateway charge (scheme MDR,
 *     T0/instant leg) the retailer pays and the exact amount credited.
 *   → { priceable: false, code: "PG_NO_SCHEME" } — the retailer's scheme has no
 *     PG slab that prices this amount; they must NOT be able to fund via PG.
 *
 * Indicative only: priced on the base amount at the default UPI leg. The actual
 * settlement re-prices on the exact captured amount + instrument at webhook
 * time, which is the authoritative figure credited.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await assertAccountActive(user.id);
    await assertServiceEnabled(SERVICE_KEYS.PG, { name: "Wallet top-up", userId: user.id, role: user.role });
    await enforceRateLimit(`wallet:topup:quote:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  // Payment Gateway top-up is a retailer-only rail — mirror the top-up POST.
  if (user.role !== "RETAILER") {
    return NextResponse.json(
      { error: "Payment Gateway top-up is available to retailers only." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const amount = Number(url.searchParams.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 200000) {
    return NextResponse.json({ error: "amount query param must be between 1 and 200000" }, { status: 400 });
  }

  const gateway = url.searchParams.get("gateway") ?? undefined;
  const selection = resolveUpiSelection(gateway);
  const gross = toNumber(round(amount));

  try {
    // Non-MDR providers (legacy Viable/BulkPe) credit the full amount — no
    // gateway charge is shown and there is no scheme-slab gate.
    if (!isPgMdrProvider(selection.provider.name)) {
      return NextResponse.json({ priceable: true, gross, mdr: 0, net: gross });
    }

    const price = await priceSchemeSettlement({
      userId: user.id,
      serviceKind: "PG",
      grossAmount: gross,
      settlementType: "T0",
      // Price the SELECTED gateway's scope (Comet/Star apply separate rates).
      scopeKey: pgMdrScopeKey(selection.provider.name, selection.channel),
      // Instrument is unknown until the customer pays — price by scope so a
      // mode-pinned slab still quotes (mirrors the enable check + settle).
      anyPaymentMode: true,
    });

    if (!price) {
      return NextResponse.json({ priceable: false, code: "PG_NO_SCHEME" });
    }

    return NextResponse.json({
      priceable: true,
      gross,
      mdr: toNumber(price.mdrAmount),
      net: toNumber(price.netAmount),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
