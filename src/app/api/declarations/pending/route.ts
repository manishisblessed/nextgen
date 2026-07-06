import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAuth();

  const approvals = await prisma.declarationApproval.findMany({
    where: { approverId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const inviteIds = [...new Set(approvals.map((a) => a.inviteId))];
  const invites = await prisma.invite.findMany({
    where: { id: { in: inviteIds } },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      status: true,
    },
  });
  const inviteMap = new Map(invites.map((i) => [i.id, i]));

  return NextResponse.json({
    approvals: approvals.map((a) => {
      const invite = inviteMap.get(a.inviteId);
      return {
        id: a.id,
        status: a.status,
        onboardeeRole: a.onboardeeRole,
        onboardeeName: invite?.name ?? invite?.phone ?? "Unknown",
        onboardeePhone: invite?.phone ?? "",
        onboardeeEmail: invite?.email ?? "",
        inviteStatus: invite?.status ?? "UNKNOWN",
        sentAt: a.createdAt.toISOString(),
        approvedAt: a.approvedAt?.toISOString() ?? null,
        rejectedAt: a.rejectedAt?.toISOString() ?? null,
        rejectedReason: a.rejectedReason ?? null,
      };
    }),
  });
}
