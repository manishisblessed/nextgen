import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { getDescendantIds } from "@/lib/security/ownership";
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
  planId: z.string().min(1),
  childId: z.string().min(1),
  billingDay: z.number().int().min(1).max(28).default(1),
  monthlyRent: z.number().nonnegative(),
  includeGst: z.boolean().default(false),
});

/**
 * POST /api/network/pos/subscribe
 *
 * A network parent creates a POS rental subscription for a child user,
 * linking a machine to a rental plan. The machine must be assigned to the
 * child.
 *
 * Commission is auto-calculated as the spread between the downstream rent
 * and the parent's own upstream cost for this machine.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (!PARENT_ROLES.includes(user.role))
      return NextResponse.json({ error: "Only network parents can create subscriptions" }, { status: 403 });
    await enforceRateLimit(`network:pos:subscribe:${user.id}`, RATE_LIMITS.sensitiveWrite);
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
  const { machineId, planId, childId, billingDay, monthlyRent, includeGst } = parsed.data;

  const expectedChildRole = ALLOWED_CHILD_ROLE[user.role];
  if (!expectedChildRole)
    return NextResponse.json({ error: "Your role cannot create POS subscriptions" }, { status: 403 });

  const child = await prisma.user.findFirst({
    where: { id: childId, parentId: user.id, deletedAt: null },
    select: { id: true, name: true, status: true, role: true },
  });
  if (!child)
    return NextResponse.json({ error: "User not found in your network" }, { status: 404 });
  if (child.role !== expectedChildRole)
    return NextResponse.json(
      { error: `You can only create subscriptions for ${expectedChildRole.replace(/_/g, " ").toLowerCase()}s` },
      { status: 400 },
    );

  // The machine may sit with the child directly OR have already flowed further
  // down the chain to one of the child's own descendants (e.g. MD → DT → RT,
  // where the machine now rests with the retailer). In every such case the
  // child is part of the machine's assignment chain, so the parent may still
  // charge them rent. Assignment only flows parent → child, so a machine held
  // anywhere in the child's subtree necessarily passed through the child.
  // Billing (lib/pos/rental.ts) bills only the lowest active tier and cascades
  // commission upward, so per-tier subscriptions can coexist on one machine.
  const childHolderIds = [childId, ...(await getDescendantIds(childId))];
  const machine = await prisma.posMachine.findFirst({
    where: { id: machineId, assignedUserId: { in: childHolderIds } },
    select: { id: true, tid: true },
  });
  if (!machine)
    return NextResponse.json({ error: "Machine is not held by this user or their downline" }, { status: 400 });

  const plan = await prisma.posRentalPlan.findFirst({
    where: { id: planId, active: true, OR: [{ ownerId: user.id }, { ownerId: null }] },
    select: { id: true, name: true, monthlyRent: true },
  });
  if (!plan)
    return NextResponse.json({ error: "Rental plan not found or inactive" }, { status: 404 });

  // Only the CHILD having an active subscription on this machine blocks a new
  // one. The parent's upstream subscription stays active as a cost anchor;
  // billing skips upstream tiers that have downstream subscriptions.
  const existing = await prisma.posSubscription.findFirst({
    where: { machineId, userId: childId, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing)
    return NextResponse.json({ error: "This user already has an active subscription for this machine" }, { status: 409 });

  // Auto-calculate commission: spread between downstream rent and parent's
  // upstream cost. Only the parent's ACTIVE subscription counts — a stale
  // cancelled row must not leak into the spread.
  const parentSub = await prisma.posSubscription.findFirst({
    where: { machineId, userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { monthlyRent: true, plan: { select: { monthlyRent: true } } },
  });
  const parentCost = parentSub ? toNumber(dec(parentSub.monthlyRent ?? parentSub.plan.monthlyRent)) : 0;
  const commission = Math.max(0, Math.round((monthlyRent - parentCost) * 100) / 100);

  const sub = await prisma.$transaction(async (tx) => {
    const created = await tx.posSubscription.create({
      data: {
        machineId,
        userId: childId,
        planId,
        billingDay,
        monthlyRent: dec(monthlyRent),
        commission: dec(commission),
        includeGst,
        createdById: user.id,
        status: "ACTIVE",
      },
    });

    // The child may have already assigned this machine further downstream and
    // set up their own subscription (createdById = child) before this upstream
    // subscription existed — in which case that downstream commission was
    // computed against a ₹0 upstream cost (full rent). Now that the child is
    // charged `monthlyRent`, recalculate their downstream spread so commission
    // cascades correctly: newSpread = max(0, downstreamRent − thisRent). This
    // mirrors the admin route's recalc so ordering of subscription creation
    // never leaves a stale spread.
    const downstreamSubs = await tx.posSubscription.findMany({
      where: { machineId, createdById: childId, status: "ACTIVE" },
      select: { id: true, monthlyRent: true, plan: { select: { monthlyRent: true } } },
    });
    for (const ds of downstreamSubs) {
      const dsRent = toNumber(dec(ds.monthlyRent ?? ds.plan.monthlyRent));
      const newCommission = Math.max(0, Math.round((dsRent - monthlyRent) * 100) / 100);
      await tx.posSubscription.update({
        where: { id: ds.id },
        data: { commission: dec(newCommission) },
      });
    }

    return created;
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "network.pos.subscribe",
      entity: "PosSubscription",
      entityId: sub.id,
      meta: {
        machineId,
        tid: machine.tid,
        childId,
        childName: child.name,
        planName: plan.name,
        monthlyRent,
        commission,
        parentCost,
        includeGst,
        billingDay,
      },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, subscriptionId: sub.id, commission });
}
