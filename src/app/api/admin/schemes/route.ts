import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/security/ownership";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/db";
import { serializeScheme } from "@/lib/scheme/serialize";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");

    const schemes = await prisma.scheme.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { slabs: true, users: true, mdrSlabs: true } } },
    });

    return NextResponse.json({ schemes: schemes.map(serializeScheme) });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/schemes] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await enforceRateLimit(`scheme:create:${admin.id}`, RATE_LIMITS.default);
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const exists = await prisma.scheme.findUnique({ where: { name: body.name } });
  if (exists)
    return NextResponse.json({ error: `A scheme named "${body.name}" already exists` }, { status: 409 });

  // Creating a default scheme must demote any current default (single default).
  const created = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.scheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.scheme.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        active: body.active,
        isDefault: body.isDefault,
        createdById: admin.id,
      },
      include: { _count: { select: { slabs: true, users: true } } },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "scheme.create",
      entity: "Scheme",
      entityId: created.id,
      meta: { name: created.name, isDefault: created.isDefault, active: created.active },
    },
  });

  return NextResponse.json({ ok: true, scheme: serializeScheme(created) }, { status: 201 });
}
