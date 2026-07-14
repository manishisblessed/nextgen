import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { flags } from "@/lib/env";
import { dec, toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PARENT_ROLES = ["DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"];

/**
 * GET /api/network/pos/rental
 *
 * Returns active rental plans and the caller's own subscriptions
 * (where createdById = caller). Accessible to SD, MD, and Distributor roles.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (!PARENT_ROLES.includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json({ error: "POS service is not enabled" }, { status: 503 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 50;

  const [plans, subs, subTotal, parentSubs, mySubs, myInvoices, myDuesAgg] = await Promise.all([
    // Plans the caller may assign from: their own plans (any status, so they
    // can manage them) plus active platform plans (ownerId = null) created by
    // admin. Own inactive plans are included so the management UI can re-enable.
    prisma.posRentalPlan.findMany({
      where: { OR: [{ ownerId: user.id }, { ownerId: null, active: true }] },
      orderBy: [{ ownerId: "desc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, monthlyRent: true, includeGst: true, active: true, ownerId: true },
    }),
    prisma.posSubscription.findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        plan: { select: { name: true, monthlyRent: true } },
        user: { select: { id: true, name: true, email: true } },
        machine: { select: { id: true, serial: true, tid: true, model: true } },
      },
    }),
    prisma.posSubscription.count({ where: { createdById: user.id } }),
    // Parent's own ACTIVE subscription per machine (upstream cost). Only active
    // subscriptions count — once a machine is assigned downstream or recalled,
    // the parent's subscription is cancelled, so a stale cancelled row must not
    // leak into the commission spread.
    prisma.posSubscription.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      distinct: ["machineId"],
      select: { machineId: true, monthlyRent: true, plan: { select: { monthlyRent: true } } },
    }),
    // Subscriptions where the caller is the one being billed (assigned to them
    // by their upstream — admin for an SD). Full detail so the subscriber can
    // see exactly what they are charged.
    prisma.posSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        plan: { select: { name: true, monthlyRent: true } },
        machine: { select: { id: true, serial: true, tid: true, model: true } },
      },
    }),
    // Recent invoices billed to the caller (rent they paid or owe).
    prisma.posRentalInvoice.findMany({
      where: { subscription: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        periodKey: true,
        amount: true,
        gstAmount: true,
        totalAmount: true,
        status: true,
        detail: true,
        createdAt: true,
        subscription: {
          select: {
            machine: { select: { tid: true, serial: true } },
            plan: { select: { name: true } },
          },
        },
      },
    }),
    // Outstanding dues: FAILED invoices stay failed until a retry collects
    // them, so their sum is exactly what the caller still owes.
    prisma.posRentalInvoice.aggregate({
      where: { subscription: { userId: user.id }, status: "FAILED" },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  // Resolve assigner names for the caller's own subscriptions (createdById has
  // no Prisma relation).
  const creatorIds = [...new Set(mySubs.map((s) => s.createdById).filter((id): id is string => Boolean(id)))];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  const machineCosts: Record<string, number> = {};
  for (const ps of parentSubs) {
    machineCosts[ps.machineId] = toNumber(dec(ps.monthlyRent ?? ps.plan.monthlyRent));
  }

  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      monthlyRent: toNumber(dec(p.monthlyRent)),
      includeGst: p.includeGst,
      active: p.active,
      isOwn: p.ownerId === user.id,
    })),
    subscriptions: subs.map((s) => ({
      id: s.id,
      status: s.status,
      billingDay: s.billingDay,
      monthlyRent: s.monthlyRent ? toNumber(dec(s.monthlyRent)) : null,
      includeGst: s.includeGst,
      commission: toNumber(dec(s.commission)),
      startedAt: s.startedAt.toISOString(),
      cancelledAt: s.cancelledAt?.toISOString() ?? null,
      plan: { name: s.plan.name, monthlyRent: toNumber(dec(s.plan.monthlyRent)) },
      user: s.user,
      machine: s.machine,
      effectiveRent: toNumber(dec(s.monthlyRent ?? s.plan.monthlyRent)),
    })),
    machineCosts,
    mySubscriptions: mySubs.map((s) => {
      const creator = s.createdById ? creatorById.get(s.createdById) : null;
      const rent = toNumber(dec(s.monthlyRent ?? s.plan.monthlyRent));
      const gstAmt = s.includeGst ? Math.round(rent * 0.18 * 100) / 100 : 0;
      return {
        id: s.id,
        status: s.status,
        billingDay: s.billingDay,
        includeGst: s.includeGst,
        startedAt: s.startedAt.toISOString(),
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        plan: { name: s.plan.name },
        machine: s.machine,
        rent,
        gstAmount: gstAmt,
        totalPerMonth: Math.round((rent + gstAmt) * 100) / 100,
        assignedBy: creator
          ? { name: creator.name, role: creator.role }
          : { name: "Platform Admin", role: "ADMIN" },
      };
    }),
    myInvoices: myInvoices.map((inv) => ({
      id: inv.id,
      periodKey: inv.periodKey,
      amount: toNumber(dec(inv.amount)),
      gstAmount: toNumber(dec(inv.gstAmount)),
      totalAmount: toNumber(dec(inv.totalAmount)),
      status: inv.status,
      detail: inv.detail,
      createdAt: inv.createdAt.toISOString(),
      machine: inv.subscription.machine,
      planName: inv.subscription.plan.name,
    })),
    myDues: {
      amount: toNumber(dec(myDuesAgg._sum.totalAmount ?? 0)),
      count: myDuesAgg._count,
    },
    subTotal,
    page,
    pageSize,
  });
}

const PostBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel_subscription"),
    subscriptionId: z.string().min(1),
  }),
  z.object({
    action: z.literal("create_plan"),
    name: z.string().min(2).max(80),
    description: z.string().max(300).optional(),
    monthlyRent: z.number().nonnegative(),
    includeGst: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("update_plan"),
    planId: z.string().min(1),
    name: z.string().min(2).max(80),
    description: z.string().max(300).optional(),
    monthlyRent: z.number().nonnegative(),
    includeGst: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("toggle_plan"),
    planId: z.string().min(1),
    active: z.boolean(),
  }),
]);

/**
 * POST /api/network/pos/rental
 *
 * Network-tier actions. Currently supports cancelling subscriptions
 * that the caller created (createdById = caller).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (!PARENT_ROLES.includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await enforceRateLimit(`network:pos:rental:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json({ error: "POS service is not enabled" }, { status: 503 });

  const parsed = PostBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  switch (body.action) {
    case "create_plan": {
      const exists = await prisma.posRentalPlan.findFirst({
        where: { ownerId: user.id, name: body.name.trim() },
        select: { id: true },
      });
      if (exists)
        return NextResponse.json({ error: `You already have a plan named "${body.name.trim()}"` }, { status: 409 });

      const plan = await prisma.posRentalPlan.create({
        data: {
          name: body.name.trim(),
          description: body.description?.trim() || null,
          monthlyRent: dec(body.monthlyRent),
          includeGst: body.includeGst,
          ownerId: user.id,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "network.pos.rental_plan_created",
          entity: "PosRentalPlan",
          entityId: plan.id,
          meta: { name: plan.name, monthlyRent: body.monthlyRent, includeGst: body.includeGst },
          ip: clientIp(req),
        },
      });
      return NextResponse.json({ ok: true, planId: plan.id }, { status: 201 });
    }

    case "update_plan": {
      const existing = await prisma.posRentalPlan.findUnique({
        where: { id: body.planId },
        select: { id: true, ownerId: true },
      });
      if (!existing) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      if (existing.ownerId !== user.id)
        return NextResponse.json({ error: "You can only edit plans you created" }, { status: 403 });

      const duplicate = await prisma.posRentalPlan.findFirst({
        where: { ownerId: user.id, name: body.name.trim(), id: { not: body.planId } },
        select: { id: true },
      });
      if (duplicate)
        return NextResponse.json({ error: `You already have another plan named "${body.name.trim()}"` }, { status: 409 });

      await prisma.posRentalPlan.update({
        where: { id: body.planId },
        data: {
          name: body.name.trim(),
          description: body.description?.trim() || null,
          monthlyRent: dec(body.monthlyRent),
          includeGst: body.includeGst,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "network.pos.rental_plan_updated",
          entity: "PosRentalPlan",
          entityId: body.planId,
          meta: { name: body.name.trim(), monthlyRent: body.monthlyRent, includeGst: body.includeGst },
          ip: clientIp(req),
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "toggle_plan": {
      const existing = await prisma.posRentalPlan.findUnique({
        where: { id: body.planId },
        select: { id: true, ownerId: true },
      });
      if (!existing) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      if (existing.ownerId !== user.id)
        return NextResponse.json({ error: "You can only manage plans you created" }, { status: 403 });

      await prisma.posRentalPlan.update({
        where: { id: body.planId },
        data: { active: body.active },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "network.pos.rental_plan_toggled",
          entity: "PosRentalPlan",
          entityId: body.planId,
          meta: { active: body.active },
          ip: clientIp(req),
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "cancel_subscription": {
      const sub = await prisma.posSubscription.findUnique({
        where: { id: body.subscriptionId },
      });
      if (!sub)
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      if (sub.createdById !== user.id)
        return NextResponse.json({ error: "You can only cancel subscriptions you created" }, { status: 403 });
      if (sub.status !== "ACTIVE")
        return NextResponse.json({ error: `Subscription is already ${sub.status}` }, { status: 409 });

      await prisma.posSubscription.update({
        where: { id: sub.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "network.pos.subscription_cancelled",
          entity: "PosSubscription",
          entityId: sub.id,
          meta: { subscriptionId: sub.id },
          ip: clientIp(req),
        },
      });

      return NextResponse.json({ ok: true });
    }
  }
}
