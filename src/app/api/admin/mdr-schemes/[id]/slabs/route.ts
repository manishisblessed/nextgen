import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { validateMdrSlab } from "@/lib/mdr/resolver";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const SlabBody = z.object({
  serviceKind: z.enum(["POS", "PG", "QR", "UPI"]),
  paymentMode: z.string().min(1).max(30).default("*"),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  mdrType: z.enum(["FLAT", "PERCENT"]).default("PERCENT"),
  mdrValue: z.number().nonnegative(),
  commissionType: z.enum(["FLAT", "PERCENT"]).default("PERCENT"),
  commissionRetailer: z.number().nonnegative().default(0),
  commissionDistributor: z.number().nonnegative().default(0),
  commissionMaster: z.number().nonnegative().default(0),
  commissionSuperDistributor: z.number().nonnegative().default(0),
});

/** POST — add a slab to an MDR scheme (band-overlap validated). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = SlabBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const scheme = await prisma.mdrScheme.findUnique({ where: { id: params.id } });
  if (!scheme) return NextResponse.json({ error: "MDR scheme not found" }, { status: 404 });

  const b = parsed.data;
  const overlap = await validateMdrSlab(params.id, b.serviceKind, b.paymentMode, {
    minAmount: b.minAmount,
    maxAmount: b.maxAmount,
  });
  if (overlap) return NextResponse.json({ error: overlap }, { status: 400 });

  const slab = await prisma.mdrSlab.create({
    data: { schemeId: params.id, ...b },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "mdr_slab.created",
      entity: "MdrSlab",
      entityId: slab.id,
      meta: { schemeId: params.id, ...b },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, slabId: slab.id }, { status: 201 });
}

const DeleteBody = z.object({ slabId: z.string().min(1) });

/** DELETE — remove a slab. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const slab = await prisma.mdrSlab.findFirst({
    where: { id: parsed.data.slabId, schemeId: params.id },
  });
  if (!slab) return NextResponse.json({ error: "Slab not found" }, { status: 404 });

  await prisma.mdrSlab.delete({ where: { id: slab.id } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "mdr_slab.deleted",
      entity: "MdrSlab",
      entityId: slab.id,
      meta: { schemeId: params.id },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true });
}
