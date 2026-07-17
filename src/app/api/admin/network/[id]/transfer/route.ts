import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { getDescendantIds } from "@/lib/security/ownership";
import { NETWORK_TIERS, getParentRole } from "@/lib/hierarchy";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const TRANSFER_EXPIRY_DAYS = 7;

const PostBody = z.object({
  newParentId: z.string().min(1, "New parent is required"),
  reason: z.string().max(500).optional(),
});

/**
 * POST — Master Admin initiates a hierarchy transfer (parent reassignment).
 * The new parent must subsequently approve via declaration before the transfer
 * takes effect.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const { id: userId } = await params;

  const parsed = PostBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { newParentId, reason } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, role: true, name: true, parentId: true, status: true },
  });
  if (!target)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!NETWORK_TIERS.includes(target.role as any))
    return NextResponse.json(
      { error: "Only network-tier users can be transferred" },
      { status: 400 }
    );

  if (!target.parentId)
    return NextResponse.json(
      { error: "User has no current parent — cannot transfer top-level users this way" },
      { status: 400 }
    );

  if (target.parentId === newParentId)
    return NextResponse.json(
      { error: "New parent is the same as current parent" },
      { status: 400 }
    );

  const requiredParentRole = getParentRole(target.role);
  if (!requiredParentRole)
    return NextResponse.json(
      { error: "This role cannot have a parent in the hierarchy" },
      { status: 400 }
    );

  const newParent = await prisma.user.findFirst({
    where: { id: newParentId, deletedAt: null },
    select: { id: true, role: true, name: true, status: true },
  });
  if (!newParent)
    return NextResponse.json({ error: "New parent not found" }, { status: 404 });

  if (newParent.role !== requiredParentRole)
    return NextResponse.json(
      {
        error: `New parent must be a ${requiredParentRole.replace(/_/g, " ")} for this ${target.role.replace(/_/g, " ")}`,
      },
      { status: 400 }
    );

  if (newParent.status !== "ACTIVE")
    return NextResponse.json(
      { error: "New parent must be an active user" },
      { status: 400 }
    );

  // Prevent circular hierarchy — new parent must not be in target's downline
  const descendants = await getDescendantIds(target.id);
  if (descendants.includes(newParentId))
    return NextResponse.json(
      { error: "Cannot transfer under a user who is already in this user's downline (circular hierarchy)" },
      { status: 400 }
    );

  // Check for existing pending transfer
  const existing = await prisma.hierarchyTransfer.findFirst({
    where: { userId: target.id, status: "PENDING_DECLARATION" },
  });
  if (existing)
    return NextResponse.json(
      { error: "A transfer is already pending for this user. Cancel it first or wait for it to expire." },
      { status: 409 }
    );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TRANSFER_EXPIRY_DAYS);

  const transfer = await prisma.hierarchyTransfer.create({
    data: {
      userId: target.id,
      oldParentId: target.parentId,
      newParentId,
      initiatedById: admin.id,
      reason,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "hierarchy.transfer_initiated",
      entity: "HierarchyTransfer",
      entityId: transfer.id,
      ip: clientIp(req),
      meta: {
        targetUserId: target.id,
        targetName: target.name,
        targetRole: target.role,
        oldParentId: target.parentId,
        newParentId,
        newParentName: newParent.name,
        reason,
      },
    },
  });

  // Notify the new parent
  try {
    await prisma.notification.create({
      data: {
        userId: newParentId,
        title: "Hierarchy Transfer Request",
        body: `Master Admin has requested to transfer ${target.name} (${target.role.replace(/_/g, " ")}) under your account. Please review and approve the declaration.`,
        channel: "INAPP",
      },
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    transfer: {
      id: transfer.id,
      status: transfer.status,
      expiresAt: transfer.expiresAt.toISOString(),
      newParent: { id: newParent.id, name: newParent.name, role: newParent.role },
    },
  });
}

/**
 * GET — List hierarchy transfers for a user (history + pending).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const { id: userId } = await params;

  const transfers = await prisma.hierarchyTransfer.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      reason: true,
      oldParent: { select: { id: true, name: true, role: true } },
      newParent: { select: { id: true, name: true, role: true } },
      initiatedBy: { select: { id: true, name: true } },
      approvedAt: true,
      rejectedAt: true,
      rejectedReason: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ transfers });
}
