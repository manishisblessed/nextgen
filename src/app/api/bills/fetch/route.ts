import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";

const FetchBody = z.object({
  biller: z.string().trim().min(1).max(120).optional(),
  consumer: z.string().trim().min(1).max(64).optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`bills:fetch:${user.id}`, RATE_LIMITS.txnCreate);
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

  const parsed = FetchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const consumer = parsed.data.consumer ?? "0000";
  return NextResponse.json({
    ok: true,
    biller: parsed.data.biller ?? "Unknown",
    consumer,
    name: "Customer " + consumer.slice(-4),
    due: Math.floor(Math.random() * 4500 + 350),
    dueDate: "30 Apr 2026",
    status: "Unpaid",
  });
}
