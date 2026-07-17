import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { toNumber, add } from "@/lib/money";
import { getEffectiveRate, withGst } from "@/lib/scheme/resolver";
import { getPartner } from "@/lib/partners";
import { requireActiveScheme, NoSchemeError } from "@/lib/scheme/gate";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

const BBPS_SERVICE = {
  ELECTRICITY: "BILL_ELECTRICITY",
  WATER: "BILL_WATER",
  GAS: "BILL_GAS",
  CREDIT_CARD: "BILL_CREDIT_CARD",
  EDUCATION: "BILL_EDUCATION",
  INSURANCE: "BILL_INSURANCE",
  BROADBAND: "RECHARGE_BROADBAND",
} as const;

const QuerySchema = z.object({
  amount: z.coerce.number().positive().max(500000),
  category: z.enum(["ELECTRICITY", "WATER", "GAS", "CREDIT_CARD", "EDUCATION", "INSURANCE", "BROADBAND"]),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/services/bbps/quote?amount=1000&category=CREDIT_CARD
 *
 * Server-authoritative charge preview for bill payment forms. Resolves from
 * the user's assigned scheme slab for the service + amount band + provider.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await requireActiveScheme(user.id);
    await enforceRateLimit(`bbps:quote:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof NoSchemeError)
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    throw e;
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { amount, category } = parsed.data;
  const service = BBPS_SERVICE[category];
  const bbps = getPartner("bbps");
  const rate = await getEffectiveRate(user.id, service, amount, bbps.name);

  const serviceCharge = toNumber(rate.charge);
  const gstBreakdown = withGst(rate.charge, 18);
  const gst = rate.chargeGstInclusive ? 0 : toNumber(gstBreakdown.gst);
  const totalCharge = rate.chargeGstInclusive ? serviceCharge : toNumber(gstBreakdown.total);
  const totalDebit = toNumber(add(amount, rate.chargeGstInclusive ? rate.charge : gstBreakdown.total));
  const commission = toNumber(rate.commissionOwn);

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
