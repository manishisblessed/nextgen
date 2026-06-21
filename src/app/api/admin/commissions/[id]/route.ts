import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const UpdateBody = z.object({
  minAmount: z.number().min(0).optional(),
  maxAmount: z.number().min(0).optional(),
  flat: z.number().nullable().optional(),
  percent: z.number().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireRole("MASTER_ADMIN", "ADMIN");
    const parsed = UpdateBody.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const existing = await prisma.commissionSlab.findUnique({
      where: { id: params.id },
    });
    if (!existing)
      return NextResponse.json({ error: "Slab not found" }, { status: 404 });

    const updated = await prisma.commissionSlab.update({
      where: { id: params.id },
      data: parsed.data as any,
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "commission.update",
        entity: "CommissionSlab",
        entityId: params.id,
        meta: { previous: { flat: Number(existing.flat), percent: Number(existing.percent) }, updated: parsed.data },
      },
    });

    return NextResponse.json({
      ok: true,
      slab: {
        ...updated,
        minAmount: Number(updated.minAmount),
        maxAmount: Number(updated.maxAmount),
        flat: updated.flat ? Number(updated.flat) : null,
        percent: updated.percent ? Number(updated.percent) : null,
      },
    });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/commissions/id] PATCH error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireRole("MASTER_ADMIN", "ADMIN");

    const existing = await prisma.commissionSlab.findUnique({
      where: { id: params.id },
    });
    if (!existing)
      return NextResponse.json({ error: "Slab not found" }, { status: 404 });

    await prisma.commissionSlab.update({
      where: { id: params.id },
      data: { active: false, effectiveTo: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "commission.deactivate",
        entity: "CommissionSlab",
        entityId: params.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/commissions/id] DELETE error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
