import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { isAdminRole } from "@/lib/security/ownership";

/**
 * GET /api/disputes/[id] — full ticket with the conversation thread.
 * Owner or admin/support only.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`disputes:detail:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const { id } = await params;
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, role: true, phone: true } },
      resolvedBy: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, role: true } } },
      },
    },
  });

  const admin = isAdminRole(user.role);
  if (!dispute || (!admin && dispute.userId !== user.id)) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  return NextResponse.json({
    dispute: {
      id: dispute.id,
      ticketNo: dispute.ticketNo,
      category: dispute.category,
      priority: dispute.priority,
      status: dispute.status,
      subject: dispute.subject,
      description: dispute.description,
      txnRefId: dispute.txnRefId,
      slaDueAt: dispute.slaDueAt,
      slaBreachedAt: dispute.slaBreachedAt,
      firstResponseAt: dispute.firstResponseAt,
      resolvedAt: dispute.resolvedAt,
      resolvedByName: dispute.resolvedBy?.name ?? null,
      resolution: dispute.resolution,
      reopenCount: dispute.reopenCount,
      createdAt: dispute.createdAt,
      ...(admin ? { raisedBy: { name: dispute.user.name, role: dispute.user.role, phone: dispute.user.phone } } : {}),
      messages: dispute.messages.map((m) => ({
        id: m.id,
        body: m.body,
        fromSupport: m.fromSupport,
        authorName: m.fromSupport ? "Support" : (m.author?.name ?? "You"),
        createdAt: m.createdAt,
      })),
    },
  });
}
