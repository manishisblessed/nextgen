import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { applyAssignment } from "@/lib/pos/assignments";
import { canAccessUser } from "@/lib/security/ownership";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { flags } from "@/lib/env";
import { dec, toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PARENT_ROLES = ["DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"];

const ALLOWED_CHILD_ROLE: Record<string, string> = {
  SUPER_DISTRIBUTOR: "MASTER_DISTRIBUTOR",
  MASTER_DISTRIBUTOR: "DISTRIBUTOR",
  DISTRIBUTOR: "RETAILER",
};

const Body = z.object({
  machineId: z.string().min(1),
  childId: z.string().min(1).nullable(),
  note: z.string().max(500).optional(),
  returnReason: z.string().max(300).optional(),
  subscription: z.object({
    planId: z.string().min(1),
    monthlyRent: z.number().nonnegative(),
    includeGst: z.boolean().default(false),
    billingDay: z.number().int().min(1).max(28).default(1),
  }).optional(),
});

/**
 * POST /api/network/pos/assign
 *
 * A network parent assigns (or recalls) a POS machine to/from a direct child.
 * The caller must currently own the machine (assignedUserId = caller).
 * Setting childId to null recalls the machine back to the caller.
 *
 * Assignment only transfers the machine. The rental (plan, rent, commission,
 * GST) is configured separately on the POS Rental page. An optional subscription
 * block is still supported for backwards compatibility; when omitted, the
 * caller's own subscription is left intact so it can be read as the upstream
 * cost when the rental is set up later.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (!PARENT_ROLES.includes(user.role))
      return NextResponse.json({ error: "Only network parents can assign POS machines" }, { status: 403 });
    await enforceRateLimit(`network:pos:assign:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json({ error: "POS service is not enabled" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { machineId, childId, note, returnReason, subscription } = parsed.data;

  const machine = await prisma.posMachine.findUnique({
    where: { id: machineId },
    select: { id: true, tid: true, assignedUserId: true },
  });
  if (!machine)
    return NextResponse.json({ error: "POS machine not found" }, { status: 404 });

  // For assigning (childId set): machine must currently belong to the caller.
  // For recalling (childId null): machine can be held by the caller's direct
  // child — verify that the current holder is a direct child of the caller.
  if (machine.assignedUserId !== user.id) {
    if (childId) {
      return NextResponse.json({ error: "This machine is not assigned to you" }, { status: 403 });
    }
    // Recall path: the current holder must be somewhere in the caller's
    // downline (direct child, grandchild, etc.). Uses the recursive CTE in
    // canAccessUser so SDs can recall from MDs, Distributors, etc.
    const canRecall = machine.assignedUserId
      ? await canAccessUser(machine.assignedUserId, user)
      : false;
    if (!canRecall)
      return NextResponse.json({ error: "This machine is not held by anyone in your network" }, { status: 403 });
  }

  if (childId) {
    if (childId === user.id)
      return NextResponse.json({ error: "Cannot assign a machine to yourself" }, { status: 400 });

    const expectedChildRole = ALLOWED_CHILD_ROLE[user.role];
    if (!expectedChildRole)
      return NextResponse.json({ error: "Your role cannot assign POS machines" }, { status: 403 });

    const child = await prisma.user.findFirst({
      where: { id: childId, parentId: user.id, deletedAt: null },
      select: { id: true, status: true, name: true, role: true },
    });
    if (!child)
      return NextResponse.json({ error: "User not found in your direct network" }, { status: 404 });
    if (child.role !== expectedChildRole)
      return NextResponse.json(
        { error: `As a ${user.role.replace(/_/g, " ").toLowerCase()}, you can only assign POS machines to ${expectedChildRole.replace(/_/g, " ").toLowerCase()}s` },
        { status: 400 },
      );
    if (child.status === "CLOSED")
      return NextResponse.json({ error: "Cannot assign to a closed account" }, { status: 400 });

    // Subscription is optional: assignment simply transfers the machine to the
    // child. The rental plan/rent is configured separately on the POS Rental
    // page. When a subscription IS provided, validate the plan up front.
    if (subscription) {
      // Validate the plan exists, is active, and is usable by the caller —
      // either their own private plan or a platform plan (ownerId = null).
      const plan = await prisma.posRentalPlan.findFirst({
        where: { id: subscription.planId, active: true, OR: [{ ownerId: user.id }, { ownerId: null }] },
      });
      if (!plan)
        return NextResponse.json({ error: "Rental plan not found or inactive" }, { status: 404 });
    }
  }

  // Capture parent's upstream cost before cancellation (for commission
  // calculation). Only the parent's ACTIVE subscription counts — this is read
  // before the transaction cancels it, and stale cancelled rows must never be
  // treated as the parent's current cost.
  const parentSub = await prisma.posSubscription.findFirst({
    where: { machineId, userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { monthlyRent: true, plan: { select: { monthlyRent: true } } },
  });
  const parentCost = parentSub ? toNumber(dec(parentSub.monthlyRent ?? parentSub.plan.monthlyRent)) : 0;

  // When recalling (childId null) a machine held by a child, the destination
  // is the caller (parent) so the machine returns to them instead of going to
  // unassigned stock.
  const recallToSelf = !childId && machine.assignedUserId !== user.id;
  const effectiveToUser = childId ?? (recallToSelf ? user.id : null);

  await prisma.$transaction(async (tx) => {
    await applyAssignment(tx, {
      machineId,
      fromUserId: machine.assignedUserId,
      toUserId: effectiveToUser,
      byUserId: user.id,
      note: note ?? (childId ? "Assigned by network parent" : "Recalled by network parent"),
      returnReason,
    });

    if (!childId) {
      // Recall: cancel only subscriptions this user created for downstream
      // users, plus any further-downstream subs. Upstream subscriptions
      // (where userId is the caller or an ancestor) must stay active.
      const callerAncestorIds: string[] = [user.id];
      let ancestorCursor = await tx.user.findUnique({
        where: { id: user.id },
        select: { parentId: true },
      });
      while (ancestorCursor?.parentId) {
        callerAncestorIds.push(ancestorCursor.parentId);
        ancestorCursor = await tx.user.findUnique({
          where: { id: ancestorCursor.parentId },
          select: { parentId: true },
        });
      }
      await tx.posSubscription.updateMany({
        where: { machineId, status: "ACTIVE", userId: { notIn: callerAncestorIds } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    } else if (machine.assignedUserId && subscription) {
      // Re-assign with subscription: only cancel subscriptions this user
      // previously created (their downstream assignments). Upstream
      // subscriptions must remain active as cost anchors for billing.
      await tx.posSubscription.updateMany({
        where: { machineId, status: "ACTIVE", createdById: user.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }

    if (childId && subscription) {
      const existing = await tx.posSubscription.findFirst({
        where: { machineId, userId: childId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!existing) {
        const commission = Math.max(0, Math.round((subscription.monthlyRent - parentCost) * 100) / 100);
        await tx.posSubscription.create({
          data: {
            machineId,
            userId: childId,
            planId: subscription.planId,
            billingDay: subscription.billingDay,
            monthlyRent: dec(subscription.monthlyRent),
            includeGst: subscription.includeGst,
            commission: dec(commission),
            createdById: user.id,
            status: "ACTIVE",
          },
        });
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: childId ? "network.pos.assign" : "network.pos.recall",
      entity: "PosMachine",
      entityId: machineId,
      meta: {
        tid: machine.tid,
        toUserId: childId,
        note: note ?? null,
        returnReason: returnReason ?? null,
        subscription: subscription ?? null,
      },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, machineId, assignedTo: childId });
}
