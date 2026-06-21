import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const Body = z.object({
  action: z.enum(["suspend", "activate", "close"]),
  reason: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireRole("MASTER_ADMIN", "ADMIN");
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { action, reason } = parsed.data;
    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, status: true },
    });

    if (!targetUser)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (targetUser.role === "ADMIN")
      return NextResponse.json({ error: "Cannot modify admin users" }, { status: 403 });

    const statusMap = {
      suspend: "SUSPENDED" as const,
      activate: "ACTIVE" as const,
      close: "CLOSED" as const,
    };

    const newStatus = statusMap[action];

    await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { status: newStatus },
      }),
      prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: `user.${action}`,
          entity: "User",
          entityId: params.id,
          meta: { reason, previousStatus: targetUser.status },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/users/id] PATCH error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
