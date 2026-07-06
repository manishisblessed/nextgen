import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { markAwaitingUser, resolveDispute } from "@/lib/disputes/service";

/**
 * POST /api/disputes/[id]/resolve — admin/support workflow actions:
 *   { action: "RESOLVE" | "REJECT", resolution }  — close the ticket
 *   { action: "AWAIT_USER" }                      — pause SLA, wait on user
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RESOLVE"), resolution: z.string().min(5).max(2000) }),
  z.object({ action: z.literal("REJECT"), resolution: z.string().min(5).max(2000) }),
  z.object({ action: z.literal("AWAIT_USER") }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    await enforceRateLimit(`disputes:resolve:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = await params;
  try {
    if (parsed.data.action === "AWAIT_USER") {
      const d = await markAwaitingUser(id, admin.id);
      return NextResponse.json({ ok: true, status: d.status });
    }
    const d = await resolveDispute({
      disputeId: id,
      adminId: admin.id,
      outcome: parsed.data.action === "RESOLVE" ? "RESOLVED" : "REJECTED",
      resolution: parsed.data.resolution,
    });
    return NextResponse.json({ ok: true, status: d.status });
  } catch (e) {
    return toErrorResponse(e);
  }
}
