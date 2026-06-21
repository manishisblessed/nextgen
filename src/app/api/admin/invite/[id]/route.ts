import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const ApproveBody = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = ApproveBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "VERIFIED" && invite.status !== "REGISTERED") {
    return NextResponse.json(
      { error: `Cannot ${parsed.data.action} invite with status ${invite.status}` },
      { status: 400 }
    );
  }

  if (parsed.data.action === "approve") {
    await prisma.$transaction(async (tx) => {
      await tx.invite.update({
        where: { id },
        data: { status: "APPROVED", approvedAt: new Date() },
      });

      if (invite.userId) {
        await tx.user.update({
          where: { id: invite.userId },
          data: { status: "ACTIVE" },
        });
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "invite.approved",
        entity: "Invite",
        entityId: id,
        meta: { approvedUserId: invite.userId },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, status: "APPROVED" });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.invite.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectedReason: parsed.data.reason ?? "Rejected by admin",
        },
      });

      if (invite.userId) {
        await tx.user.update({
          where: { id: invite.userId },
          data: { status: "SUSPENDED" },
        });
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "invite.rejected",
        entity: "Invite",
        entityId: id,
        meta: { rejectedUserId: invite.userId, reason: parsed.data.reason },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, status: "REJECTED" });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const verifications = await prisma.verificationResult.findMany({
    where: { inviteId: id },
    orderBy: { createdAt: "desc" },
  });

  let registeredUser = null;
  if (invite.userId) {
    registeredUser = await prisma.user.findUnique({
      where: { id: invite.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        shopName: true,
        state: true,
        city: true,
        pincode: true,
        createdAt: true,
      },
    });
  }

  return NextResponse.json({ invite, verifications, registeredUser });
}
