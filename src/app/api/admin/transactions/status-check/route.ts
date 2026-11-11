import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { checkProviderStatusOne } from "@/lib/recon/reconcileOne";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PostBody = z.object({ refId: z.string().min(1) }).strict();

/**
 * POST /api/admin/transactions/status-check
 *
 * READ-ONLY live provider status probe. Mutates nothing — no ledger movement,
 * no status transition. Returns the authoritative provider verdict plus the
 * matched reference so ops can decide whether to Resolve/verify or force a
 * Not-found refund.
 *
 * Intentionally rate-limited to prevent ops from hammering the provider
 * status API under panic conditions.
 */
export async function POST(req: Request) {
  try {
    const actor = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`txn:status-check:${actor.id}`, RATE_LIMITS.sensitiveWrite);

    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await checkProviderStatusOne(parsed.data.refId);
    if (!result.found)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
