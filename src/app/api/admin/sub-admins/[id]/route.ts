import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const PatchBody = z.object({
  action: z.enum(["suspend", "activate"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, status: true, name: true },
  });

  if (!target || target.role !== "SUPPORT") {
    return NextResponse.json({ error: "Sub-admin not found" }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action } = parsed.data;
  const status = action === "suspend" ? "SUSPENDED" : "ACTIVE";

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { status },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      twoFactorEnabled: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: `sub-admin.${action}`,
      entity: "User",
      entityId: params.id,
      meta: { action, name: target.name },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, subAdmin: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, name: true },
  });

  if (!target || target.role !== "SUPPORT") {
    return NextResponse.json({ error: "Sub-admin not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: "CLOSED" },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "sub-admin.deleted",
      entity: "User",
      entityId: params.id,
      meta: { name: target.name },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
