import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { assertLivenessReady, LivenessRequiredError } from "@/lib/security/livenessGate";
import { percentOf, round, lte, dec, toNumber } from "@/lib/money";

const Body = z.object({
  mode: z.enum(["IMPS", "NEFT", "RTGS"]),
  beneficiary: z.object({
    name: z.string().min(2),
    accountNumber: z.string().min(6),
    ifsc: z.string().length(11),
    mobile: z.string().optional()
  }).strict(),
  amount: z.number().positive().max(500000),
  remitterMobile: z.string().min(10),
  purpose: z.string().optional(),
  idempotencyKey: z.string().min(8)
}).strict();

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
  const userId = user.id;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const dmt = getPartner("dmt");
  // Fee + commission are derived server-side (never from the request body) with
  // Decimal money math. Commission = 0.4% of amount, capped at ₹25.
  const fee = parsed.data.mode === "RTGS" ? 12 : parsed.data.mode === "NEFT" ? 6 : 5;
  const commission = (() => {
    const raw = round(percentOf(parsed.data.amount, 0.4));
    const cap = dec(25);
    return toNumber(lte(raw, cap) ? raw : cap);
  })();

  const result = await runTransaction({
    userId,
    service: parsed.data.mode === "IMPS" ? "DMT_IMPS" : parsed.data.mode === "NEFT" ? "DMT_NEFT" : "DMT_RTGS",
    amount: parsed.data.amount,
    fee,
    commission,
    idempotencyKey: parsed.data.idempotencyKey,
    customer: parsed.data.beneficiary.accountNumber.slice(-4),
    operator: parsed.data.beneficiary.ifsc.slice(0, 4),
    partner: dmt.name,
    request: parsed.data,
    call: () => dmt.transfer({ userId, ...parsed.data })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
