import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** GET — all MDR schemes with slab/user counts. */
export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
    const schemes = await prisma.mdrScheme.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { slabs: true, users: true } } },
    });
    return NextResponse.json({
      schemes: schemes.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        active: s.active,
        isDefault: s.isDefault,
        slabs: s._count.slabs,
        users: s._count.users,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/mdr-schemes] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateBody = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  isDefault: z.boolean().default(false),
});

/** POST — create an MDR scheme. */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const exists = await prisma.mdrScheme.findUnique({ where: { name: parsed.data.name } });
  if (exists)
    return NextResponse.json(
      { error: `An MDR scheme named "${parsed.data.name}" already exists` },
      { status: 409 }
    );

  const created = await prisma.$transaction(async (tx) => {
    // Only one default at a time.
    if (parsed.data.isDefault) {
      await tx.mdrScheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.mdrScheme.create({
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim(),
        isDefault: parsed.data.isDefault,
        createdById: admin.id,
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "mdr_scheme.created",
      entity: "MdrScheme",
      entityId: created.id,
      meta: { name: created.name, isDefault: created.isDefault },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, scheme: created }, { status: 201 });
}
