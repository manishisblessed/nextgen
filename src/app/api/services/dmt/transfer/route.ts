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
    // Admin kill-switch + per-user allowlist (default-disabled) for this rail.
    await assertServiceEnabled(SERVICE_KEYS.DMT, { name: "Money Transfer", userId: user.id, role: user.role });
    // Onboarding liveness gate — network users must have a face baseline first.
    await assertLivenessReady(user);
    await enforceRateLimit(`txn:create:${user.id}`, RATE_LIMITS.txnCreate);
    // Transaction PIN — required on every money-moving action (x-txn-pin header).
    await requireTxnPin(user, req, { action: "dmt.transfer", ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  } catch (e) {
    return toErrorResponse(e);
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

  try {
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
  } catch (e) {
    return toErrorResponse(e);
  }
}
