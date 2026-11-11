import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { correctOneTransaction } from "@/lib/recon/reconcileOne";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PostBody = z
  .object({
    refId: z.string().min(1),
    providerRef: z.string().optional(),
    remarks: z.string().optional(),
    forceRefundNotFound: z.boolean().optional(),
  })
  .strict();

/** POST /api/admin/transactions/resolve */
export async function POST(req: Request) {
  try {
    const actor = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`txn:resolve:${actor.id}`, RATE_LIMITS.sensitiveWrite);

    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await correctOneTransaction(parsed.data.refId, {
      actorId: actor.id,
      providerRef: parsed.data.providerRef,
      remarks: parsed.data.remarks,
      forceRefundNotFound: parsed.data.forceRefundNotFound,
      source: "admin_resolve",
    });

    if (!result.found)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    if (result.outcome === "unresolved")
      return NextResponse.json({ ...result }, { status: 409 });

    if (result.outcome === "amount_mismatch")
      return NextResponse.json({ ...result }, { status: 422 });

    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
