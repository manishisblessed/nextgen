import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { isAdminRole } from "@/lib/security/ownership";
import { createDispute } from "@/lib/disputes/service";

/**
 * Disputes / support tickets.
 *   GET  — own tickets (admins/support: all, with ?status= & ?breached=true filters)
 *   POST — raise a ticket (optionally linked to a Transaction refId)
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  category: z.enum(["TRANSACTION", "SETTLEMENT", "COMMISSION", "WALLET", "KYC", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  subject: z.string().min(5).max(140),
  description: z.string().min(10).max(4000),
  txnRefId: z.string().max(40).optional(),
}).strict();

const STATUS = z.enum(["OPEN", "UNDER_REVIEW", "AWAITING_USER", "RESOLVED", "REJECTED"]);

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`disputes:list:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const url = new URL(req.url);
  const admin = isAdminRole(user.role);
  const statusParam = STATUS.safeParse(url.searchParams.get("status"));

  const where: Prisma.DisputeWhereInput = {
    ...(admin ? {} : { userId: user.id }),
    ...(statusParam.success ? { status: statusParam.data } : {}),
    ...(admin && url.searchParams.get("breached") === "true"
      ? { slaBreachedAt: { not: null }, status: { in: ["OPEN", "UNDER_REVIEW", "AWAITING_USER"] } }
      : {}),
  };

  const disputes = await prisma.dispute.findMany({
    where,
    orderBy: [{ status: "asc" }, { slaDueAt: "asc" }],
    take: 100,
    include: {
      user: { select: { name: true, role: true, phone: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    disputes: disputes.map((d) => ({
      id: d.id,
      ticketNo: d.ticketNo,
      category: d.category,
      priority: d.priority,
      status: d.status,
      subject: d.subject,
      txnRefId: d.txnRefId,
      slaDueAt: d.slaDueAt,
      slaBreachedAt: d.slaBreachedAt,
      resolvedAt: d.resolvedAt,
      messageCount: d._count.messages,
      createdAt: d.createdAt,
      ...(admin ? { raisedBy: { name: d.user.name, role: d.user.role, phone: d.user.phone } } : {}),
    })),
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`disputes:create:${user.id}`, RATE_LIMITS.fundRequestCreate);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const dispute = await createDispute({ userId: user.id, ...parsed.data });
    return NextResponse.json(
      {
        id: dispute.id,
        ticketNo: dispute.ticketNo,
        status: dispute.status,
        slaDueAt: dispute.slaDueAt,
      },
      { status: 201 }
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
