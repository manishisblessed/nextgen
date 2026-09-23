import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { clientIp } from "@/lib/security/audit";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * Assign / unassign users to an incentive scheme, and set per-user overrides.
 *
 * A user is "on" a scheme when a UserIncentiveConfig row exists. `minAmount`
 * overrides the entry threshold for that user (e.g. the scheme defaults to ₹20
 * lakh but this retailer unlocks at ₹15 lakh); `rewardValue` optionally
 * overrides the reward rate. Null clears an override (falls back to the tier).
 */
const Body = z.object({
  schemeId: z.string().min(1),
  op: z.enum(["assign", "unassign", "override"]),
  // assign / unassign — bulk
  userIds: z.array(z.string().min(1)).max(5000).optional(),
  // override — single user
  userId: z.string().min(1).optional(),
  minAmount: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  rewardValue: z.number().nonnegative().max(1_000_000).nullable().optional(),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive.assign",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveScheme",
    });
    await enforceRateLimit(`incentive:assign:${admin.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const scheme = await prisma.incentiveScheme.findUnique({
    where: { id: b.schemeId },
    select: { id: true, active: true },
  });
  if (!scheme) return NextResponse.json({ error: "Incentive not found" }, { status: 404 });

  if (b.op === "assign") {
    const ids = b.userIds ?? [];
    if (ids.length === 0)
      return NextResponse.json({ error: "No users provided" }, { status: 400 });
    // Only assign to existing, non-deleted users.
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    let count = 0;
    for (const u of users) {
      await prisma.userIncentiveConfig.upsert({
        where: { userId_schemeId: { userId: u.id, schemeId: b.schemeId } },
        update: { active: true },
        create: { userId: u.id, schemeId: b.schemeId, active: true },
      });
      count++;
    }
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "incentive.assign",
        entity: "IncentiveScheme",
        entityId: b.schemeId,
        meta: { userCount: count, userIds: users.map((u) => u.id) },
        ip: clientIp(req),
      },
    });
    return NextResponse.json({ ok: true, updated: count });
  }

  if (b.op === "unassign") {
    const ids = b.userIds ?? [];
    if (ids.length === 0)
      return NextResponse.json({ error: "No users provided" }, { status: 400 });
    const res = await prisma.userIncentiveConfig.deleteMany({
      where: { schemeId: b.schemeId, userId: { in: ids } },
    });
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "incentive.unassign",
        entity: "IncentiveScheme",
        entityId: b.schemeId,
        meta: { userCount: res.count, userIds: ids },
        ip: clientIp(req),
      },
    });
    return NextResponse.json({ ok: true, updated: res.count });
  }

  // op === "override"
  if (!b.userId)
    return NextResponse.json({ error: "userId is required for override" }, { status: 400 });
  const existing = await prisma.userIncentiveConfig.findUnique({
    where: { userId_schemeId: { userId: b.userId, schemeId: b.schemeId } },
  });
  if (!existing)
    return NextResponse.json(
      { error: "User is not assigned to this incentive. Assign first." },
      { status: 404 }
    );

  const updated = await prisma.userIncentiveConfig.update({
    where: { id: existing.id },
    data: {
      ...(b.minAmount !== undefined ? { minAmount: b.minAmount } : {}),
      ...(b.rewardValue !== undefined ? { rewardValue: b.rewardValue } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive.override",
      entity: "UserIncentiveConfig",
      entityId: updated.id,
      meta: { schemeId: b.schemeId, userId: b.userId, minAmount: b.minAmount, rewardValue: b.rewardValue },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({
    ok: true,
    config: {
      id: updated.id,
      minAmount: updated.minAmount != null ? Number(updated.minAmount) : null,
      rewardValue: updated.rewardValue != null ? Number(updated.rewardValue) : null,
    },
  });
}
