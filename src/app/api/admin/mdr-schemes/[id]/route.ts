import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { dec, toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** GET — one MDR scheme with its slabs. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
    const scheme = await prisma.mdrScheme.findUnique({
      where: { id: params.id },
      include: {
        slabs: { orderBy: [{ serviceKind: "asc" }, { paymentMode: "asc" }, { minAmount: "asc" }] },
        _count: { select: { users: true } },
      },
    });
    if (!scheme) return NextResponse.json({ error: "MDR scheme not found" }, { status: 404 });

    return NextResponse.json({
      scheme: {
        id: scheme.id,
        name: scheme.name,
        description: scheme.description,
        active: scheme.active,
        isDefault: scheme.isDefault,
        users: scheme._count.users,
        slabs: scheme.slabs.map((s) => ({
          id: s.id,
          serviceKind: s.serviceKind,
          paymentMode: s.paymentMode,
          minAmount: toNumber(dec(s.minAmount)),
          maxAmount: toNumber(dec(s.maxAmount)),
          mdrType: s.mdrType,
          mdrValue: toNumber(dec(s.mdrValue)),
          commissionType: s.commissionType,
          commissionRetailer: toNumber(dec(s.commissionRetailer)),
          commissionDistributor: toNumber(dec(s.commissionDistributor)),
          commissionMaster: toNumber(dec(s.commissionMaster)),
          commissionSuperDistributor: toNumber(dec(s.commissionSuperDistributor)),
          active: s.active,
        })),
      },
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/mdr-schemes/:id] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const PatchBody = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  active: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

/** PATCH — update scheme metadata / default flag / active. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const scheme = await prisma.mdrScheme.findUnique({ where: { id: params.id } });
  if (!scheme) return NextResponse.json({ error: "MDR scheme not found" }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.mdrScheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.mdrScheme.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description?.trim() ?? null }
          : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "mdr_scheme.updated",
      entity: "MdrScheme",
      entityId: updated.id,
      meta: parsed.data as object,
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — remove a scheme with no assigned users. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const scheme = await prisma.mdrScheme.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!scheme) return NextResponse.json({ error: "MDR scheme not found" }, { status: 404 });
  if (scheme._count.users > 0)
    return NextResponse.json(
      { error: `Cannot delete — ${scheme._count.users} user(s) are assigned to this scheme` },
      { status: 409 }
    );

  await prisma.mdrScheme.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "mdr_scheme.deleted",
      entity: "MdrScheme",
      entityId: params.id,
      meta: { name: scheme.name },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true });
}
