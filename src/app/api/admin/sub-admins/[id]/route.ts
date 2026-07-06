import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { bumpTokenVersion } from "@/lib/security/session";

const PatchBody = z.object({
  action: z.enum(["suspend", "activate", "update-tabs"]),
  allowedTabs: z.array(z.string()).optional(),
}).strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

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

  const { action, allowedTabs } = parsed.data;

  let update: Record<string, unknown>;
  if (action === "update-tabs") {
    if (!allowedTabs) {
      return NextResponse.json(
        { error: "allowedTabs required for update-tabs action" },
        { status: 400 }
      );
    }
    update = { allowedTabs };
  } else {
    update = { status: action === "suspend" ? "SUSPENDED" : "ACTIVE" };
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: update as any,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      allowedTabs: true,
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
      meta: { action, name: target.name, ...(allowedTabs ? { allowedTabs } : {}) },
      ip: clientIp(req),
    },
  });

  // Suspend/activate is a privilege change → invalidate the target's sessions.
  await bumpTokenVersion(params.id, { swallow: true });

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
      ip: clientIp(req),
    },
  });

  await bumpTokenVersion(params.id, { swallow: true });

  return NextResponse.json({ ok: true });
}
