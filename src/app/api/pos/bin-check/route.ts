import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { lookupBin } from "@/lib/pos/binLookup";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const schema = z.object({
  card: z.string().min(6).max(19),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`pos:bin:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Card number must be at least 6 digits" }, { status: 400 });
  }

  const result = await lookupBin(parsed.data.card);
  if (!result) {
    return NextResponse.json({ error: "BIN lookup failed or provider not configured" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...result });
}
