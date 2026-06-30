import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { assertLivenessReady, LivenessRequiredError } from "@/lib/security/livenessGate";
import { percentOf, round, toNumber } from "@/lib/money";

const Body = z.object({
  type: z.enum(["MOBILE", "DTH", "BROADBAND"]),
  operatorCode: z.string().min(2),
  number: z.string().min(6),
  amount: z.number().positive().max(10000),
  circle: z.string().optional(),
  idempotencyKey: z.string().min(8)
}).strict();

const SERVICE = { MOBILE: "RECHARGE_MOBILE", DTH: "RECHARGE_DTH", BROADBAND: "RECHARGE_BROADBAND" } as const;

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

  const partner = getPartner("recharge");
  const result = await runTransaction({
    userId: user.id,
    service: SERVICE[parsed.data.type],
    amount: parsed.data.amount,
    // Commission is computed server-side with Decimal money math (never floats,
    // never from the request body): 3% of the order amount.
    commission: toNumber(round(percentOf(parsed.data.amount, 3))),
    idempotencyKey: parsed.data.idempotencyKey,
    customer: parsed.data.number,
    operator: parsed.data.operatorCode,
    partner: partner.name,
    request: parsed.data,
    call: () => partner.recharge({ userId: user.id, ...parsed.data })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
