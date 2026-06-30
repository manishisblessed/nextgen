import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const PatchBody = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const kyc = await prisma.kyc.findUnique({
    where: { id: params.id },
    include: { user: { select: { id: true, status: true } } },
  });

  if (!kyc)
    return NextResponse.json({ error: "KYC record not found" }, { status: 404 });

  if (kyc.status !== "PENDING_REVIEW")
    return NextResponse.json(
      { error: "Only pending KYC applications can be reviewed" },
      { status: 409 }
    );

  if (parsed.data.action === "approve") {
    await prisma.$transaction([
      prisma.kyc.update({
        where: { id: params.id },
        data: {
          status: "APPROVED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
          rejectedReason: null,
        },
      }),
      prisma.user.update({
        where: { id: kyc.user.id },
        data: { status: "ACTIVE" },
      }),
      prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: "kyc.approved",
          entity: "Kyc",
          entityId: params.id,
          meta: { userId: kyc.user.id },
        },
      }),
    ]);

    return NextResponse.json({ status: "APPROVED" });
  }

  // Reject
  await prisma.$transaction([
    prisma.kyc.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectedReason: parsed.data.reason ?? null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "kyc.rejected",
        entity: "Kyc",
        entityId: params.id,
        meta: {
          userId: kyc.user.id,
          reason: parsed.data.reason,
        },
      },
    }),
  ]);

  return NextResponse.json({ status: "REJECTED" });
}
