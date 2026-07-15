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
  // Company/card dimensions (Same Day style); null/omitted = any.
  company: z.string().trim().min(1).max(60).nullish(),
  cardType: z.string().trim().min(1).max(30).nullish(),
  brandType: z.string().trim().min(1).max(30).nullish(),
  classification: z.string().trim().min(1).max(30).nullish(),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  mdrType: z.enum(["FLAT", "PERCENT"]).default("PERCENT"),
  mdrValue: z.number().nonnegative(),
  // Instant (T+0) settlement rate; 0 = unset, falls back to mdrValue.
  mdrValueT0: z.number().nonnegative().default(0),
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
  const overlap = await validateMdrSlab(
    params.id,
    b.serviceKind,
    b.paymentMode,
    { minAmount: b.minAmount, maxAmount: b.maxAmount },
    undefined,
    {
      company: b.company ?? null,
      cardType: b.cardType ?? null,
      brandType: b.brandType ?? null,
      classification: b.classification ?? null,
    }
  );
  if (overlap) return NextResponse.json({ error: overlap }, { status: 400 });

  const slab = await prisma.mdrSlab.create({
    data: {
      schemeId: params.id,
      ...b,
      company: b.company ?? null,
      cardType: b.cardType ?? null,
      brandType: b.brandType ?? null,
      classification: b.classification ?? null,
    },
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

const UpdateBody = z.object({
  slabId: z.string().min(1),
  paymentMode: z.string().min(1).max(30).optional(),
  company: z.string().trim().min(1).max(60).nullish(),
  cardType: z.string().trim().min(1).max(30).nullish(),
  brandType: z.string().trim().min(1).max(30).nullish(),
  classification: z.string().trim().min(1).max(30).nullish(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().positive().optional(),
  mdrType: z.enum(["FLAT", "PERCENT"]).optional(),
  mdrValue: z.number().nonnegative().optional(),
  mdrValueT0: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

/** PATCH — edit a slab's values/dimensions (band-overlap revalidated). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { slabId, ...b } = parsed.data;

  const existing = await prisma.mdrSlab.findFirst({ where: { id: slabId, schemeId: params.id } });
  if (!existing) return NextResponse.json({ error: "Slab not found" }, { status: 404 });

  const next = {
    paymentMode: b.paymentMode ?? existing.paymentMode,
    company: b.company !== undefined ? b.company : existing.company,
    cardType: b.cardType !== undefined ? b.cardType : existing.cardType,
    brandType: b.brandType !== undefined ? b.brandType : existing.brandType,
    classification: b.classification !== undefined ? b.classification : existing.classification,
    minAmount: b.minAmount ?? Number(existing.minAmount),
    maxAmount: b.maxAmount ?? Number(existing.maxAmount),
  };

  const overlap = await validateMdrSlab(
    params.id,
    existing.serviceKind,
    next.paymentMode,
    { minAmount: next.minAmount, maxAmount: next.maxAmount },
    existing.id,
    {
      company: next.company ?? null,
      cardType: next.cardType ?? null,
      brandType: next.brandType ?? null,
      classification: next.classification ?? null,
    }
  );
  if (overlap) return NextResponse.json({ error: overlap }, { status: 400 });

  const updated = await prisma.mdrSlab.update({
    where: { id: existing.id },
    data: {
      ...next,
      ...(b.mdrType !== undefined ? { mdrType: b.mdrType } : {}),
      ...(b.mdrValue !== undefined ? { mdrValue: b.mdrValue } : {}),
      ...(b.mdrValueT0 !== undefined ? { mdrValueT0: b.mdrValueT0 } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "mdr_slab.updated",
      entity: "MdrSlab",
      entityId: updated.id,
      meta: { schemeId: params.id, changes: b },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, slabId: updated.id });
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
