import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({
  reason: z.string().min(3, "Reason is required (min 3 characters)").max(500),
});

/**
 * POST — New parent rejects a hierarchy transfer request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();

  const transfer = await prisma.hierarchyTransfer.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, role: true } },
      newParent: { select: { id: true, name: true } },
    },
  });

  if (!transfer)
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  if (transfer.newParentId !== user.id)
    return NextResponse.json(
      { error: "Only the designated new parent can reject this transfer" },
      { status: 403 }
    );

  if (transfer.status !== "PENDING_DECLARATION")
    return NextResponse.json(
      { error: `This transfer has already been ${transfer.status.toLowerCase().replace(/_/g, " ")}` },
      { status: 400 }
    );

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = new Date();

  await prisma.hierarchyTransfer.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectedAt: now,
      rejectedReason: parsed.data.reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "hierarchy.transfer_rejected",
      entity: "HierarchyTransfer",
      entityId: id,
      ip: clientIp(req),
      meta: {
        targetUserId: transfer.userId,
        targetName: transfer.user.name,
        newParentId: transfer.newParentId,
        newParentName: transfer.newParent.name,
        reason: parsed.data.reason,
      },
    },
  });

  // Notify the master admin who initiated
  try {
    await prisma.notification.create({
      data: {
        userId: transfer.initiatedById,
        title: "Transfer Rejected",
        body: `${user.name} has rejected the transfer of ${transfer.user.name}. Reason: ${parsed.data.reason}`,
        channel: "INAPP",
      },
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    transfer: {
      id: transfer.id,
      status: "REJECTED",
      rejectedAt: now.toISOString(),
      rejectedReason: parsed.data.reason,
    },
  });
}
