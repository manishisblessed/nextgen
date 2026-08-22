import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { approveManualSlip, rejectManualSlip, ManualSlipError } from "@/lib/pos/manualSlip";

/**
 * POST /api/admin/pos/manual-slips/[id]
 *
 * Approve or reject a manual POS slip. Any admin may act; no second approval is
 * required. Approve splices the slip into the shared settlement engine (mirror +
 * PENDING settlement entry); reject records a reason shown to the retailer.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1, "A reason is required").max(500) }),
]);

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.action === "approve") {
      const { slip, capture } = await approveManualSlip(params.id, admin.id);
      return NextResponse.json({
        ok: true,
        status: slip.status,
        transactionRef: slip.transactionRef,
        settlement: {
          status: capture.status,
          mode: capture.mode ?? null,
          netAmount: capture.netAmount ?? null,
          mdrAmount: capture.mdrAmount ?? null,
        },
      });
    }
    const { slip } = await rejectManualSlip(params.id, admin.id, parsed.data.reason);
    return NextResponse.json({ ok: true, status: slip.status });
  } catch (e) {
    if (e instanceof ManualSlipError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return toErrorResponse(e);
  }
}
