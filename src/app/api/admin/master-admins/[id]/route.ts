import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { bumpTokenVersion } from "@/lib/security/session";

const PatchBody = z
  .object({
    action: z.enum(["suspend", "activate", "update-tabs"]),
    allowedTabs: z.array(z.string()).optional(),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let caller;
  try {
    caller = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (caller.id === params.id) {
    return NextResponse.json(
      { error: "You cannot modify your own account from here" },
      { status: 403 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, status: true, name: true },
  });

  if (!target || target.role !== "MASTER_ADMIN") {
    return NextResponse.json({ error: "Master admin not found" }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, allowedTabs } = parsed.data;
  let update: Record<string, unknown> = {};

  switch (action) {
    case "suspend":
      update = { status: "SUSPENDED" };
      break;
    case "activate":
      update = { status: "ACTIVE" };
      break;
    case "update-tabs":
      if (!allowedTabs) {
        return NextResponse.json(
          { error: "allowedTabs required for update-tabs action" },
          { status: 400 }
        );
      }
      update = { allowedTabs };
      break;
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
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: caller.id,
      action: `master_admin.${action}`,
      entity: "User",
      entityId: params.id,
      meta: { action, allowedTabs },
      ip: clientIp(req),
    },
  });

  await bumpTokenVersion(params.id, { swallow: true });

  return NextResponse.json({ ok: true, masterAdmin: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  let caller;
  try {
    caller = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (caller.id === params.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 403 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, name: true },
  });

  if (!target || target.role !== "MASTER_ADMIN") {
    return NextResponse.json({ error: "Master admin not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: "CLOSED" },
  });

  await prisma.auditLog.create({
    data: {
      userId: caller.id,
      action: "master_admin.deleted",
      entity: "User",
      entityId: params.id,
      meta: { name: target.name },
      ip: clientIp(req),
    },
  });

  await bumpTokenVersion(params.id, { swallow: true });

  return NextResponse.json({ ok: true });
}
