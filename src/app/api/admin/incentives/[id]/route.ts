import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { clientIp } from "@/lib/security/audit";
import { prisma } from "@/lib/db";
import { serializeIncentiveScheme } from "@/lib/incentive/serialize";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** GET — one incentive scheme with tiers + assigned users. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    const scheme = await prisma.incentiveScheme.findUnique({
      where: { id: params.id },
      include: {
        tiers: true,
        _count: { select: { tiers: true, configs: true } },
      },
    });
    if (!scheme) return NextResponse.json({ error: "Incentive not found" }, { status: 404 });

    const configs = await prisma.userIncentiveConfig.findMany({
      where: { schemeId: params.id },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });

    const assignedUsers = configs.map((c) => ({
      id: c.user.id,
      name: c.user.name,
      email: c.user.email,
      role: c.user.role,
      configId: c.id,
      minAmount: c.minAmount != null ? Number(c.minAmount) : null,
      rewardValue: c.rewardValue != null ? Number(c.rewardValue) : null,
      rewardValueT0: c.rewardValueT0 != null ? Number(c.rewardValueT0) : null,
      active: c.active,
    }));

    return NextResponse.json({
      scheme: serializeIncentiveScheme(scheme),
      assignedUsers,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/incentives/:id] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const UpdateBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullish(),
  rewardType: z.enum(["CASHBACK_ON_MDR", "CASHBACK_ON_VOLUME", "FLAT"]).optional(),
  volumeBasis: z.enum(["GROSS", "NET"]).optional(),
  active: z.boolean().optional(),
});

/** PATCH — edit an incentive scheme (name/reward config/active). */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive_scheme.update",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveScheme",
      entityId: params.id,
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const existing = await prisma.incentiveScheme.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Incentive not found" }, { status: 404 });

  if (b.name && b.name !== existing.name) {
    const dup = await prisma.incentiveScheme.findUnique({ where: { name: b.name } });
    if (dup) return NextResponse.json({ error: `Name "${b.name}" is taken` }, { status: 409 });
  }

  const updated = await prisma.incentiveScheme.update({
    where: { id: params.id },
    data: {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.rewardType !== undefined ? { rewardType: b.rewardType } : {}),
      ...(b.volumeBasis !== undefined ? { volumeBasis: b.volumeBasis } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    },
    include: { _count: { select: { tiers: true, configs: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive_scheme.update",
      entity: "IncentiveScheme",
      entityId: updated.id,
      meta: { changes: b },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, scheme: serializeIncentiveScheme(updated) });
}

/** DELETE — remove an incentive scheme (tiers + assignments cascade). */
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive_scheme.delete",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveScheme",
      entityId: params.id,
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const existing = await prisma.incentiveScheme.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Incentive not found" }, { status: 404 });

  // Preserve the payout audit trail: detach it (payouts already reference the
  // scheme by id and carry their own snapshot) is not possible with RESTRICT, so
  // block hard-delete when payouts exist — deactivate instead.
  const payoutCount = await prisma.incentivePayout.count({ where: { schemeId: params.id } });
  if (payoutCount > 0) {
    const deactivated = await prisma.incentiveScheme.update({
      where: { id: params.id },
      data: { active: false },
    });
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "incentive_scheme.deactivate",
        entity: "IncentiveScheme",
        entityId: deactivated.id,
        meta: { reason: "has payout history", payoutCount },
        ip: clientIp(req),
      },
    });
    return NextResponse.json({
      ok: true,
      deactivated: true,
      message: "Incentive has payout history — deactivated instead of deleted.",
    });
  }

  await prisma.incentiveScheme.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive_scheme.delete",
      entity: "IncentiveScheme",
      entityId: params.id,
      meta: { name: existing.name },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true });
}
