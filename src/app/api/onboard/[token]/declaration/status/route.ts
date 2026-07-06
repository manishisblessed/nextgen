import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { needsSuccessorApproval } from "@/lib/declaration/types";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: {
      id: true,
      role: true,
      status: true,
      invitedById: true,
      expiresAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedById },
    select: { role: true, name: true },
  });

  const requiresApproval = inviter
    ? needsSuccessorApproval(invite.role, inviter.role)
    : false;

  if (!requiresApproval) {
    return NextResponse.json({
      requiresApproval: false,
      selfDeclarationOnly: true,
      approverName: null,
      approval: null,
    });
  }

  const approval = await prisma.declarationApproval.findFirst({
    where: { inviteId: invite.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      approvedAt: true,
      rejectedAt: true,
      rejectedReason: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    requiresApproval: true,
    selfDeclarationOnly: false,
    approverName: inviter?.name ?? null,
    approval: approval
      ? {
          id: approval.id,
          status: approval.status,
          approvedAt: approval.approvedAt?.toISOString() ?? null,
          rejectedAt: approval.rejectedAt?.toISOString() ?? null,
          rejectedReason: approval.rejectedReason ?? null,
          sentAt: approval.createdAt.toISOString(),
        }
      : null,
  });
}
