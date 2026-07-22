import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** GET — all company MDR floor entries. */
export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "FINANCE");
    const floors = await prisma.companyMdrFloor.findMany({
      orderBy: [{ serviceKind: "asc" }, { paymentMode: "asc" }, { minAmount: "asc" }],
    });
    return NextResponse.json({
      floors: floors.map((f) => ({
        id: f.id,
        serviceKind: f.serviceKind,
        paymentMode: f.paymentMode,
        minAmount: Number(f.minAmount),
        maxAmount: Number(f.maxAmount),
        mdrType: f.mdrType,
        mdrValue: Number(f.mdrValue),
        mdrValueT0: Number(f.mdrValueT0),
        active: f.active,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/company-charges] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateBody = z.object({
  serviceKind: z.enum(["POS", "PG", "QR"]),
  paymentMode: z.string().trim().min(1).max(30).default("*"),
  minAmount: z.number().nonnegative().default(0),
  maxAmount: z.number().positive().default(999999999),
  mdrType: z.enum(["FLAT", "PERCENT"]).default("PERCENT"),
  mdrValue: z.number().nonnegative(),
  mdrValueT0: z.number().nonnegative().default(0),
});

const normMode = (v: string) => (v === "*" ? "*" : v.toUpperCase());

/** POST — create a company MDR floor entry. */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const b = {
    ...parsed.data,
    paymentMode: normMode(parsed.data.paymentMode),
  };

  if (b.minAmount > b.maxAmount)
    return NextResponse.json({ error: "minAmount must be ≤ maxAmount" }, { status: 400 });

  const overlap = await checkOverlap(b.serviceKind, b.paymentMode, b.minAmount, b.maxAmount);
  if (overlap) return NextResponse.json({ error: overlap }, { status: 400 });

  const floor = await prisma.companyMdrFloor.create({ data: b });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "company_mdr_floor.created",
      entity: "CompanyMdrFloor",
      entityId: floor.id,
      meta: b,
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, floorId: floor.id }, { status: 201 });
}

const UpdateBody = z.object({
  floorId: z.string().min(1),
  paymentMode: z.string().trim().min(1).max(30).optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().positive().optional(),
  mdrType: z.enum(["FLAT", "PERCENT"]).optional(),
  mdrValue: z.number().nonnegative().optional(),
  mdrValueT0: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

/** PATCH — update a company MDR floor entry. */
export async function PATCH(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { floorId, ...b } = parsed.data;

  const existing = await prisma.companyMdrFloor.findUnique({ where: { id: floorId } });
  if (!existing) return NextResponse.json({ error: "Floor entry not found" }, { status: 404 });

  const next = {
    paymentMode: b.paymentMode !== undefined ? normMode(b.paymentMode) : existing.paymentMode,
    minAmount: b.minAmount ?? Number(existing.minAmount),
    maxAmount: b.maxAmount ?? Number(existing.maxAmount),
  };

  if (next.minAmount > next.maxAmount)
    return NextResponse.json({ error: "minAmount must be ≤ maxAmount" }, { status: 400 });

  const overlap = await checkOverlap(
    existing.serviceKind,
    next.paymentMode,
    next.minAmount,
    next.maxAmount,
    existing.id
  );
  if (overlap) return NextResponse.json({ error: overlap }, { status: 400 });

  const updated = await prisma.companyMdrFloor.update({
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
      action: "company_mdr_floor.updated",
      entity: "CompanyMdrFloor",
      entityId: updated.id,
      meta: { changes: b },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, floorId: updated.id });
}

const DeleteBody = z.object({ floorId: z.string().min(1) });

/** DELETE — remove a company MDR floor entry. */
export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const floor = await prisma.companyMdrFloor.findUnique({ where: { id: parsed.data.floorId } });
  if (!floor) return NextResponse.json({ error: "Floor entry not found" }, { status: 404 });

  await prisma.companyMdrFloor.delete({ where: { id: floor.id } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "company_mdr_floor.deleted",
      entity: "CompanyMdrFloor",
      entityId: floor.id,
      meta: { serviceKind: floor.serviceKind, paymentMode: floor.paymentMode },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Validate no overlapping bands exist for the same (serviceKind, paymentMode).
 */
async function checkOverlap(
  serviceKind: string,
  paymentMode: string,
  minAmount: number,
  maxAmount: number,
  excludeId?: string
): Promise<string | null> {
  const existing = await prisma.companyMdrFloor.findMany({
    where: {
      serviceKind: serviceKind as "POS" | "PG" | "QR",
      paymentMode,
      active: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { minAmount: true, maxAmount: true },
  });
  for (const r of existing) {
    if (minAmount <= Number(r.maxAmount) && Number(r.minAmount) <= maxAmount) {
      return `Range ₹${minAmount}–₹${maxAmount} overlaps an existing ${serviceKind}/${paymentMode} floor (₹${Number(r.minAmount)}–₹${Number(r.maxAmount)})`;
    }
  }
  return null;
}
