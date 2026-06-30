import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { assertLivenessReady } from "@/lib/security/livenessGate";
import { toErrorResponse } from "@/lib/security/apiErrors";

const Body = z.object({
  amount: z.number().positive().max(100000),
  vpa: z.string().optional(),
  note: z.string().max(80).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().min(10),
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
    await assertServiceEnabled(SERVICE_KEYS.UPI, { name: "UPI Collect" });
    await enforceRateLimit(`upi:collect:${user.id}`, RATE_LIMITS.txnCreate);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const upi = getPartner("upi");
  const r = await upi.collect({
    userId: user.id,
    idempotencyKey: parsed.data.idempotencyKey,
    amount: parsed.data.amount,
    vpa: parsed.data.vpa,
    note: parsed.data.note,
    customerEmail: parsed.data.customerEmail,
    customerPhone: parsed.data.customerPhone,
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/upi/callback`
  });

  // Audit the collect request (idempotency-keyed; the inbound credit posts to
  // the ledger later via the PG webhook, not here).
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: r.ok ? "upi.collect_requested" : "upi.collect_failed",
      entity: "UpiCollect",
      entityId: r.ok ? r.data.orderId : parsed.data.idempotencyKey,
      meta: { amount: parsed.data.amount, ok: r.ok, code: r.ok ? undefined : r.code },
    },
  });

  return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}
