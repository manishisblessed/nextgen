import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { isAdminRole } from "@/lib/security/ownership";
import { addDisputeMessage } from "@/lib/disputes/service";

/**
 * POST /api/disputes/[id]/messages — reply on a ticket.
 * The ticket owner replies as the user; admin/support roles reply as support
 * (which stamps first-response SLA and advances the workflow).
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({ body: z.string().min(1).max(4000) }).strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`disputes:reply:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = await params;
  const admin = isAdminRole(user.role);
  const dispute = await prisma.dispute.findUnique({ where: { id }, select: { userId: true } });
  if (!dispute || (!admin && dispute.userId !== user.id)) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  try {
    const message = await addDisputeMessage({
      disputeId: id,
      authorId: user.id,
      fromSupport: admin,
      body: parsed.data.body,
    });
    return NextResponse.json({ ok: true, messageId: message.id }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
