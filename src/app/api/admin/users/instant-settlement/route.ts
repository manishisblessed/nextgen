import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().min(1),
  enabled: z.boolean(),
}).strict();

/**
 * POST /api/admin/users/instant-settlement
 *
 * Toggle instant POS settlement for a user. Admin/Master-Admin only.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { userId, enabled } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, instantSettlement: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: userId },
    data: { instantSettlement: enabled },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "user.instant_settlement.toggle",
      entity: "User",
      entityId: userId,
      meta: { enabled, previousValue: user.instantSettlement, by: admin.email },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, userId, instantSettlement: enabled });
}
