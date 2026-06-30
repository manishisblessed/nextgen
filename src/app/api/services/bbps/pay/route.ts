import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { assertLivenessReady, LivenessRequiredError } from "@/lib/security/livenessGate";
import { percentOf, round, lte, dec, toNumber } from "@/lib/money";

const Body = z.object({
  billerCode: z.string().min(2),
  category: z.enum(["ELECTRICITY", "WATER", "GAS", "CREDIT_CARD", "EDUCATION", "INSURANCE", "BROADBAND"]),
  customerParams: z.record(z.string()),
  amount: z.number().positive().max(500000),
  idempotencyKey: z.string().min(8)
}).strict();

const SERVICE = {
  ELECTRICITY: "BILL_ELECTRICITY",
  WATER: "BILL_WATER",
  GAS: "BILL_GAS",
  CREDIT_CARD: "BILL_CREDIT_CARD",
  EDUCATION: "BILL_EDUCATION",
  INSURANCE: "BILL_INSURANCE",
  BROADBAND: "RECHARGE_BROADBAND"
} as const;

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    // Onboarding liveness gate — network users must have a face baseline first.
    await assertLivenessReady(user);
    await enforceRateLimit(`txn:create:${user.id}`, RATE_LIMITS.txnCreate);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof LivenessRequiredError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const bbps = getPartner("bbps");
  const result = await runTransaction({
    userId: user.id,
    service: SERVICE[parsed.data.category],
    amount: parsed.data.amount,
    fee: 0,
    // Server-side Decimal commission: 0.8% of amount, capped at ₹15.
    commission: (() => {
      const raw = round(percentOf(parsed.data.amount, 0.8));
      const cap = dec(15);
      return toNumber(lte(raw, cap) ? raw : cap);
    })(),
    idempotencyKey: parsed.data.idempotencyKey,
    customer: Object.values(parsed.data.customerParams)[0],
    operator: parsed.data.billerCode,
    partner: bbps.name,
    request: parsed.data,
    call: () => bbps.pay({ userId: user.id, ...parsed.data })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
