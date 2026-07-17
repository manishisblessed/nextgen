import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({
  signatureUrl: z.string().url(),
  selfieUrl: z.string().url(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * POST — New parent approves a hierarchy transfer by providing declaration
 * evidence (signature, selfie, GPS). On approval the system executes the actual
 * parentId swap and clears the old scheme assignment.
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
      user: { select: { id: true, name: true, role: true, schemeId: true } },
      oldParent: { select: { id: true, name: true } },
      newParent: { select: { id: true, name: true } },
    },
  });

  if (!transfer)
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  if (transfer.newParentId !== user.id)
    return NextResponse.json(
      { error: "Only the designated new parent can approve this transfer" },
      { status: 403 }
    );

  if (transfer.status !== "PENDING_DECLARATION")
    return NextResponse.json(
      { error: `This transfer has already been ${transfer.status.toLowerCase().replace(/_/g, " ")}` },
      { status: 400 }
    );

  if (new Date() > transfer.expiresAt) {
    await prisma.hierarchyTransfer.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { error: "This transfer request has expired. Master Admin must initiate a new one." },
      { status: 400 }
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const now = new Date();

  // Execute the transfer in a transaction:
  // 1. Update HierarchyTransfer status
  // 2. Swap parentId on the user
  // 3. Clear scheme (new parent will assign their own)
  await prisma.$transaction([
    prisma.hierarchyTransfer.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverSignatureUrl: parsed.data.signatureUrl,
        approverSelfieUrl: parsed.data.selfieUrl,
        approvedAt: now,
        approvalIp: ip,
        approvalUserAgent: userAgent,
        approvalLatitude: parsed.data.latitude,
        approvalLongitude: parsed.data.longitude,
      },
    }),
    prisma.user.update({
      where: { id: transfer.userId },
      data: {
        parentId: transfer.newParentId,
        schemeId: null,
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "hierarchy.transfer_approved",
      entity: "HierarchyTransfer",
      entityId: id,
      ip,
      userAgent,
      meta: {
        targetUserId: transfer.userId,
        targetName: transfer.user.name,
        oldParentId: transfer.oldParentId,
        oldParentName: transfer.oldParent.name,
        newParentId: transfer.newParentId,
        newParentName: transfer.newParent.name,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      },
    },
  });

  // Notify relevant parties
  const notifications = [
    {
      userId: transfer.userId,
      title: "Parent Transfer Complete",
      body: `You have been transferred under ${transfer.newParent.name}. Your previous commission scheme has been cleared — your new parent will assign one.`,
      channel: "INAPP" as const,
    },
    {
      userId: transfer.oldParentId,
      title: "Network Member Transferred",
      body: `${transfer.user.name} (${transfer.user.role.replace(/_/g, " ")}) has been transferred out of your network by Master Admin.`,
      channel: "INAPP" as const,
    },
    {
      userId: transfer.initiatedById,
      title: "Transfer Approved",
      body: `${transfer.newParent.name} has approved the transfer of ${transfer.user.name}. The hierarchy has been updated.`,
      channel: "INAPP" as const,
    },
  ];

  try {
    await prisma.notification.createMany({ data: notifications });
  } catch {}

  return NextResponse.json({
    ok: true,
    transfer: {
      id: transfer.id,
      status: "APPROVED",
      approvedAt: now.toISOString(),
    },
  });
}
