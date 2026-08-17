import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { requireActiveScheme } from "@/lib/scheme/gate";
import { getEffectiveRate, withGst } from "@/lib/scheme/resolver";
import { BBPS_PRICE_SCOPES } from "@/lib/services/priceScope";
import { toNumber, add } from "@/lib/money";
import { AuthError } from "@/lib/auth-server";

const Body = z
  .object({
    amount: z.number().positive().max(500000),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * POST /api/services/rechargekit-direct/charges
 *
 * Scheme-driven charge preview for the Offline CC Bill Payment rail. The direct
 * RechargeKit API exposes no charges endpoint, so the customer-facing charge,
 * GST, total wallet debit, and commission are resolved purely from the user's
 * scheme slab (priced under the "rechargekit_direct" product scope).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError("Offline CC Bill Payment is available for retailers only", 403);
    await assertServiceEnabled(SERVICE_KEYS.RECHARGEKIT_DIRECT, {
      name: "Offline CC Bill Payment",
      userId: user.id,
      role: user.role,
    });
    await requireActiveScheme(user.id);
    await enforceRateLimit(`rkd:charges:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { amount } = parsed.data;

  const rate = await getEffectiveRate(
    user.id,
    "BILL_CREDIT_CARD",
    amount,
    BBPS_PRICE_SCOPES.RECHARGEKIT_DIRECT
  );

  const serviceCharge = toNumber(rate.charge);
  const gstBreakdown = withGst(rate.charge, 18);
  const gst = rate.chargeGstInclusive ? 0 : toNumber(gstBreakdown.gst);
  const totalCharge = rate.chargeGstInclusive
    ? serviceCharge
    : toNumber(gstBreakdown.total);
  const totalDebit = toNumber(
    add(amount, rate.chargeGstInclusive ? rate.charge : gstBreakdown.total)
  );
  const commission = toNumber(rate.commission);

  return NextResponse.json({
    amount,
    serviceCharge,
    gst,
    gstPercent: rate.chargeGstInclusive ? 0 : 18,
    totalCharge,
    totalDebit,
    commission,
    source: rate.source,
    schemeName: rate.schemeName,
  });
}
