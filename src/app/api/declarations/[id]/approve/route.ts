import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";

const Body = z.object({
  signatureUrl: z.string().url(),
  selfieUrl: z.string().url(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();

  const approval = await prisma.declarationApproval.findUnique({
    where: { id },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  if (approval.approverId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (approval.status !== "PENDING") {
    return NextResponse.json(
      { error: `This declaration has already been ${approval.status.toLowerCase()}` },
      { status: 400 }
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const now = new Date();

  const updated = await prisma.declarationApproval.update({
    where: { id },
    data: {
      status: "APPROVED",
      approverSignatureUrl: parsed.data.signatureUrl,
      approverSelfieUrl: parsed.data.selfieUrl,
      approvedAt: now,
      approvalIp: ip,
      approvalUserAgent: userAgent,
      approvalLatitude: parsed.data.latitude,
      approvalLongitude: parsed.data.longitude,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "declaration.approved",
      entity: "DeclarationApproval",
      entityId: id,
      ip,
      userAgent,
      meta: {
        inviteId: approval.inviteId,
        onboardeeRole: approval.onboardeeRole,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        approvedAt: now.toISOString(),
      },
    },
  });

  const invite = await prisma.invite.findFirst({
    where: { id: approval.inviteId },
    select: { name: true, phone: true, role: true },
  });

  try {
    await prisma.notification.create({
      data: {
        userId: approval.requestedById,
        title: "Declaration Approved",
        body: `${user.name} (${approval.approverRole.replace(/_/g, " ")}) has approved your declaration. You can now complete your registration.`,
        channel: "INAPP",
      },
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    approval: {
      id: updated.id,
      status: updated.status,
      approvedAt: updated.approvedAt?.toISOString(),
    },
  });
}
