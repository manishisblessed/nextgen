import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";
import { serializeIncentiveScheme } from "@/lib/incentive/serialize";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** GET — list all incentive schemes with tier + assigned-user counts. */
export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    const schemes = await prisma.incentiveScheme.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { tiers: true, configs: true } } },
    });
    return NextResponse.json({ schemes: schemes.map(serializeIncentiveScheme) });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/incentives] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  rail: z.enum(["QR", "POS", "PG", "COMBINED"]),
  rewardType: z.enum(["CASHBACK_ON_MDR", "CASHBACK_ON_VOLUME", "FLAT"]).default("CASHBACK_ON_MDR"),
  volumeBasis: z.enum(["GROSS", "NET"]).default("GROSS"),
  active: z.boolean().default(true),
});

/** POST — create an incentive scheme. */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive_scheme.create",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveScheme",
    });
    await enforceRateLimit(`incentive:create:${admin.id}`, RATE_LIMITS.default);
  } catch (e: unknown) {
    return toErrorResponse(e);
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const exists = await prisma.incentiveScheme.findUnique({ where: { name: body.name } });
  if (exists)
    return NextResponse.json(
      { error: `An incentive named "${body.name}" already exists` },
      { status: 409 }
    );

  const created = await prisma.incentiveScheme.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      rail: body.rail,
      rewardType: body.rewardType,
      volumeBasis: body.volumeBasis,
      active: body.active,
      createdById: admin.id,
    },
    include: { _count: { select: { tiers: true, configs: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "incentive_scheme.create",
      entity: "IncentiveScheme",
      entityId: created.id,
      meta: { name: created.name, rail: created.rail, rewardType: created.rewardType },
    },
  });

  return NextResponse.json(
    { ok: true, scheme: serializeIncentiveScheme(created) },
    { status: 201 }
  );
}
