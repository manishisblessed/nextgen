import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  }

  if (invite.status === "APPROVED") {
    return NextResponse.json(
      { error: "This invite has already been approved", status: invite.status },
      { status: 400 }
    );
  }

  if (invite.status === "REJECTED") {
    return NextResponse.json(
      { error: "This invite has been rejected", status: invite.status },
      { status: 400 }
    );
  }

  if (invite.status === "EXPIRED" || new Date() > invite.expiresAt) {
    if (invite.status !== "EXPIRED") {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
    }
    return NextResponse.json(
      { error: "This invite link has expired", status: "EXPIRED" },
      { status: 400 }
    );
  }

  const verifications = await prisma.verificationResult.findMany({
    where: { inviteId: invite.id },
    select: { type: true, status: true, verifiedName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invite: {
      id: invite.id,
      phone: invite.phone,
      email: invite.email,
      role: invite.role,
      name: invite.name,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      phoneVerifiedAt: invite.phoneVerifiedAt?.toISOString() ?? null,
      emailVerifiedAt: invite.emailVerifiedAt?.toISOString() ?? null,
      aadhaarVerifiedAt: invite.aadhaarVerifiedAt?.toISOString() ?? null,
    },
    verifications,
  });
}
