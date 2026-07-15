import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertLivenessReady } from "@/lib/security/livenessGate";
import { requireTxnPin } from "@/lib/security/txnPin";
import { clientIp } from "@/lib/security/audit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { getEffectiveRate } from "@/lib/scheme/resolver";
import { toNumber } from "@/lib/money";

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
    // Admin kill-switch + per-user allowlist (default-disabled) for this rail.
    await assertServiceEnabled(SERVICE_KEYS.BBPS, { name: "Bill Payments", userId: user.id, role: user.role });
    // Onboarding liveness gate — network users must have a face baseline first.
    await assertLivenessReady(user);
    await enforceRateLimit(`txn:create:${user.id}`, RATE_LIMITS.txnCreate);
    // Transaction PIN — required on every money-moving action (x-txn-pin header).
    await requireTxnPin(user, req, { action: "bbps.pay", ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const bbps = getPartner("bbps");
  try {
    // Scheme-driven pricing (cascade model): the user's assigned scheme slab
    // sets the charge (fee) and their own commission; ancestors earn margins
    // via distributeCommission after success. No hardcoded rates.
    const service = SERVICE[parsed.data.category];
    // Provider-scoped slabs: a slab pinned to this BBPS partner wins over the
    // any-provider slab for the same band.
    const rate = await getEffectiveRate(user.id, service, parsed.data.amount, bbps.name);

    const result = await runTransaction({
      userId: user.id,
      service,
      amount: parsed.data.amount,
      fee: toNumber(rate.charge),
      commission: toNumber(rate.commissionOwn),
      idempotencyKey: parsed.data.idempotencyKey,
      customer: Object.values(parsed.data.customerParams)[0],
      operator: parsed.data.billerCode,
      partner: bbps.name,
      request: parsed.data,
      call: () => bbps.pay({ userId: user.id, ...parsed.data })
    });

    const httpStatus = result.status === "SUCCESS" ? 200 : result.status === "PROCESSING" ? 202 : 502;
    return NextResponse.json(result, { status: httpStatus });
  } catch (e) {
    return toErrorResponse(e);
  }
}
