import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole, assertCanAccessUser } from "@/lib/security/ownership";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { flags } from "@/lib/env";
import { posMachineSelect, serializePosMachine } from "@/lib/pos/assignments";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const AssignBody = z.object({
  machineId: z.string().min(1, "machineId is required"),
  // null / absent userId unassigns the machine.
  userId: z.string().min(1).nullable().default(null),
  note: z.string().max(500).optional(),
}).strict();

const ASSIGNABLE_ROLES = new Set(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"]);

/**
 * POST /api/admin/pos/machines/assign
 *
 * Assign (or unassign when userId is null) a synced POS machine to a platform
 * user. Object-level authorization: the admin must be able to access the
 * target user (assertCanAccessUser). Audit-logged + assignment-log entry.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await enforceRateLimit(`pos:assign:${admin.id}`, RATE_LIMITS.default);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json(
        { error: e.message, retryAfterSec: e.result.retryAfterSec },
        { status: 429 }
      );
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json(
      { error: "POS service is not enabled" },
      { status: 503 }
    );

  const parsed = AssignBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { machineId, userId, note } = parsed.data;

  const machine = await prisma.posMachine.findUnique({
    where: { id: machineId },
    select: { id: true, assignedUserId: true },
  });
  if (!machine)
    return NextResponse.json({ error: "POS machine not found" }, { status: 404 });

  // Validate + authorize the target user when assigning.
  if (userId) {
    const target = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, status: true },
    });
    if (!target)
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    if (!ASSIGNABLE_ROLES.has(target.role))
      return NextResponse.json(
        { error: "POS machines can only be assigned to retailer/distributor accounts" },
        { status: 400 }
      );
    if (target.status === "CLOSED")
      return NextResponse.json(
        { error: "Cannot assign a machine to a closed account" },
        { status: 400 }
      );

    // Object-level authorization (IDOR guard) on the assignment target.
    try {
      await assertCanAccessUser(userId, admin);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
      throw e;
    }
  }

  const fromUserId = machine.assignedUserId;
  const action = userId ? "assign" : "unassign";

  // No-op guard: nothing to do.
  if (fromUserId === userId) {
    const current = await prisma.posMachine.findUnique({
      where: { id: machineId },
      select: posMachineSelect,
    });
    return NextResponse.json({ ok: true, machine: current && serializePosMachine(current) });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.posMachine.update({
      where: { id: machineId },
      data: {
        assignedUserId: userId,
        assignedAt: userId ? new Date() : null,
        assignedById: userId ? admin.id : null,
      },
      select: posMachineSelect,
    });

    await tx.posAssignmentLog.create({
      data: {
        machineId,
        action,
        fromUserId: fromUserId ?? undefined,
        toUserId: userId ?? undefined,
        byUserId: admin.id,
        note: note ?? undefined,
      },
    });

    return row;
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: `pos.machine.${action}`,
      entity: "PosMachine",
      entityId: machineId,
      meta: { fromUserId, toUserId: userId, by: admin.email, note: note ?? null },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, machine: serializePosMachine(updated) });
}
