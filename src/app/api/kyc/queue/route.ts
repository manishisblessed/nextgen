import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const kycs = await prisma.kyc.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          shopName: true,
          city: true,
          state: true,
          documents: {
            select: {
              id: true,
              type: true,
              publicId: true,
              url: true,
              format: true,
              uploadedAt: true,
            },
            orderBy: { uploadedAt: "desc" },
          },
        },
      },
    },
    orderBy: [
      { status: "asc" },
      { submittedAt: "desc" },
    ],
  });

  const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
    prisma.kyc.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.kyc.count({ where: { status: "APPROVED" } }),
    prisma.kyc.count({ where: { status: "REJECTED" } }),
  ]);

  return NextResponse.json({
    kycs: kycs.map((k) => ({
      id: k.id,
      status: k.status,
      panNumber: k.panNumber,
      aadhaarLast4: k.aadhaarLast4,
      gstin: k.gstin,
      dob: k.dob?.toISOString() ?? null,
      rejectedReason: k.rejectedReason,
      submittedAt: k.submittedAt?.toISOString() ?? null,
      reviewedAt: k.reviewedAt?.toISOString() ?? null,
      user: {
        id: k.user.id,
        name: k.user.name,
        email: k.user.email,
        phone: k.user.phone,
        role: k.user.role,
        status: k.user.status,
        shopName: k.user.shopName,
        city: k.user.city,
        state: k.user.state,
      },
      documents: k.user.documents.map((d) => ({
        id: d.id,
        type: d.type,
        publicId: d.publicId,
        url: d.url,
        format: d.format,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    })),
    stats: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    },
  });
}
