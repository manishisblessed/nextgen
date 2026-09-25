import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { clientIp } from "@/lib/security/audit";
import { prisma } from "@/lib/db";
import { serializeTier } from "@/lib/incentive/serialize";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const TierBody = z.object({
  label: z.string().trim().min(1).max(40).nullish(),
  minAmount: z.number().nonnegative().max(1_000_000_000),
  maxAmount: z.number().positive().max(1_000_000_000),
  rewardType: z.enum(["FLAT", "PERCENT"]).default("PERCENT"),
  // Fraction for PERCENT (0.0010 = 0.10%) or ₹ for FLAT. This is the T+1
  // (standard) reward rate, applied to the T+1-settled leg.
  rewardValue: z.number().nonnegative().max(1_000_000),
  // Instant (T+0) reward rate for the instant-settled leg. 0 (default) = reward
  // instant business at the same rate as T+1 (rewardValue).
  rewardValueT0: z.number().nonnegative().max(1_000_000).default(0),
  active: z.boolean().default(true),
});

/** POST — add a reward tier to an incentive scheme. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive_tier.create",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveTier",
      entityId: params.id,
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = TierBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  if (b.maxAmount <= b.minAmount)
    return NextResponse.json(
      { error: "Max amount must be greater than min amount." },
      { status: 400 }
    );

  const scheme = await prisma.incentiveScheme.findUnique({ where: { id: params.id } });
  if (!scheme) return NextResponse.json({ error: "Incentive not found" }, { status: 404 });

  const tier = await prisma.incentiveTier.create({
    data: {
      schemeId: params.id,
      label: b.label ?? null,
      minAmount: b.minAmount,
      maxAmount: b.maxAmount,
      rewardType: b.rewardType,
      rewardValue: b.rewardValue,
      rewardValueT0: b.rewardValueT0,
      active: b.active,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive_tier.create",
      entity: "IncentiveTier",
      entityId: tier.id,
      meta: { schemeId: params.id, ...b },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, tier: serializeTier(tier) }, { status: 201 });
}

const UpdateBody = z.object({
  tierId: z.string().min(1),
  label: z.string().trim().min(1).max(40).nullish(),
  minAmount: z.number().nonnegative().max(1_000_000_000).optional(),
  maxAmount: z.number().positive().max(1_000_000_000).optional(),
  rewardType: z.enum(["FLAT", "PERCENT"]).optional(),
  rewardValue: z.number().nonnegative().max(1_000_000).optional(),
  rewardValueT0: z.number().nonnegative().max(1_000_000).optional(),
  active: z.boolean().optional(),
});

/** PATCH — edit a reward tier. */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive_tier.update",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveTier",
      entityId: params.id,
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { tierId, ...b } = parsed.data;

  const existing = await prisma.incentiveTier.findFirst({
    where: { id: tierId, schemeId: params.id },
  });
  if (!existing) return NextResponse.json({ error: "Tier not found" }, { status: 404 });

  const nextMin = b.minAmount ?? Number(existing.minAmount);
  const nextMax = b.maxAmount ?? Number(existing.maxAmount);
  if (nextMax <= nextMin)
    return NextResponse.json(
      { error: "Max amount must be greater than min amount." },
      { status: 400 }
    );

  const updated = await prisma.incentiveTier.update({
    where: { id: existing.id },
    data: {
      ...(b.label !== undefined ? { label: b.label } : {}),
      ...(b.minAmount !== undefined ? { minAmount: b.minAmount } : {}),
      ...(b.maxAmount !== undefined ? { maxAmount: b.maxAmount } : {}),
      ...(b.rewardType !== undefined ? { rewardType: b.rewardType } : {}),
      ...(b.rewardValue !== undefined ? { rewardValue: b.rewardValue } : {}),
      ...(b.rewardValueT0 !== undefined ? { rewardValueT0: b.rewardValueT0 } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive_tier.update",
      entity: "IncentiveTier",
      entityId: updated.id,
      meta: { schemeId: params.id, changes: b },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, tier: serializeTier(updated) });
}

const DeleteBody = z.object({ tierId: z.string().min(1) });

/** DELETE — remove a reward tier. */
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive_tier.delete",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveTier",
      entityId: params.id,
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tier = await prisma.incentiveTier.findFirst({
    where: { id: parsed.data.tierId, schemeId: params.id },
  });
  if (!tier) return NextResponse.json({ error: "Tier not found" }, { status: 404 });

  await prisma.incentiveTier.delete({ where: { id: tier.id } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive_tier.delete",
      entity: "IncentiveTier",
      entityId: tier.id,
      meta: { schemeId: params.id },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true });
}
