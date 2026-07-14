import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { serializeSlab } from "@/lib/scheme/serialize";
import { validateNonOverlapping } from "@/lib/scheme/resolver";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const UpdateBody = z
  .object({
    minAmount: z.number().min(0).max(100000000).optional(),
    maxAmount: z.number().min(0).max(100000000).optional(),
    chargeType: z.enum(["FLAT", "PERCENT"]).optional(),
    chargeValue: z.number().min(0).optional(),
    commissionType: z.enum(["FLAT", "PERCENT"]).optional(),
    commissionRetailer: z.number().min(0).optional(),
    commissionDistributor: z.number().min(0).optional(),
    commissionMaster: z.number().min(0).optional(),
    // Cascade model: commission the ASSIGNED user earns on this slab.
    commissionValue: z.number().min(0).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; slabId: string } }
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const existing = await prisma.schemeSlab.findUnique({ where: { id: params.slabId } });
  if (!existing || existing.schemeId !== params.id)
    return NextResponse.json({ error: "Slab not found" }, { status: 404 });

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const nextMin = body.minAmount ?? Number(existing.minAmount);
  const nextMax = body.maxAmount ?? Number(existing.maxAmount);

  // Re-validate non-overlap if range changed or slab is being re-activated.
  if (body.minAmount !== undefined || body.maxAmount !== undefined || body.active === true) {
    const overlap = await validateNonOverlapping(
      existing.schemeId,
      existing.service,
      { minAmount: nextMin, maxAmount: nextMax },
      existing.id
    );
    if (overlap) return NextResponse.json({ error: overlap }, { status: 409 });
  }

  const updated = await prisma.schemeSlab.update({
    where: { id: params.slabId },
    data: body,
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "scheme.slab.update",
      entity: "SchemeSlab",
      entityId: params.slabId,
      meta: { schemeId: params.id, changes: body },
    },
  });

  return NextResponse.json({ ok: true, slab: serializeSlab(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; slabId: string } }
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const existing = await prisma.schemeSlab.findUnique({ where: { id: params.slabId } });
  if (!existing || existing.schemeId !== params.id)
    return NextResponse.json({ error: "Slab not found" }, { status: 404 });

  await prisma.schemeSlab.delete({ where: { id: params.slabId } });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "scheme.slab.delete",
      entity: "SchemeSlab",
      entityId: params.slabId,
      meta: { schemeId: params.id, service: existing.service },
    },
  });

  return NextResponse.json({ ok: true });
}
