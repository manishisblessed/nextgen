import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/db";
import { recentTransactions } from "@/lib/data";

const CreateBody = z.object({
  service: z.string().trim().min(1).max(64).optional(),
  amount: z.number().nonnegative().max(500000).optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
  return NextResponse.json({ ok: true, data: recentTransactions });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`txn:create:${user.id}`, RATE_LIMITS.txnCreate);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json(
        { error: e.message, retryAfterSec: e.result.retryAfterSec },
        { status: 429 }
      );
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const refId =
    "TXN" +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase();

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "transaction.demo",
      entity: "Transaction",
      entityId: refId,
      meta: { service: parsed.data.service ?? "Generic", amount: parsed.data.amount ?? 0 },
    },
  });

  return NextResponse.json({
    ok: true,
    refId,
    service: parsed.data.service ?? "Generic",
    amount: parsed.data.amount ?? 0,
    status: "Success",
    timestamp: new Date().toISOString(),
  });
}
