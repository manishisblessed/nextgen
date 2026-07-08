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
          shopAddress: true,
          city: true,
          state: true,
          pincode: true,
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

  const userIds = kycs.map((k) => k.userId);

  const verificationResults = await prisma.verificationResult.findMany({
    where: { userId: { in: userIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      verifiedName: true,
      requestPayload: true,
      responsePayload: true,
      createdAt: true,
    },
  });

  const verificationsByUser = new Map<string, typeof verificationResults>();
  for (const v of verificationResults) {
    if (!v.userId) continue;
    const list = verificationsByUser.get(v.userId) ?? [];
    list.push(v);
    verificationsByUser.set(v.userId, list);
  }

  const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
    prisma.kyc.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.kyc.count({ where: { status: "APPROVED" } }),
    prisma.kyc.count({ where: { status: "REJECTED" } }),
  ]);

  return NextResponse.json({
    kycs: kycs.map((k) => {
      const vResults = verificationsByUser.get(k.userId) ?? [];
      const kycVerifications = vResults.filter(
        (v) => !v.type.startsWith("DOCUMENT_") && !v.type.startsWith("ONBOARD_")
      );
      const onboardDocs = vResults.filter(
        (v) => v.type.startsWith("DOCUMENT_") || v.type.startsWith("ONBOARD_")
      );

      return {
        id: k.id,
        status: k.status,
        panNumber: k.panNumber,
        panName: k.panName,
        panVerifiedAt: k.panVerifiedAt?.toISOString() ?? null,
        aadhaarLast4: k.aadhaarLast4,
        aadhaarNumber: k.aadhaarNumber,
        aadhaarName: k.aadhaarName,
        aadhaarDob: k.aadhaarDob,
        aadhaarGender: k.aadhaarGender,
        aadhaarAddress: k.aadhaarAddress,
        aadhaarMobile: k.aadhaarMobile,
        aadhaarVerifiedAt: k.aadhaarVerifiedAt?.toISOString() ?? null,
        bankAccountName: k.bankAccountName,
        bankAccountNumber: k.bankAccountNumber,
        bankIfsc: k.bankIfsc,
        bankAccountStatus: k.bankAccountStatus,
        gstin: k.gstin,
        msmeNumber: k.msmeNumber,
        nameMismatch: k.nameMismatch,
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
          shopAddress: k.user.shopAddress,
          city: k.user.city,
          state: k.user.state,
          pincode: k.user.pincode,
        },
        documents: k.user.documents.map((d) => ({
          id: d.id,
          type: d.type,
          publicId: d.publicId,
          url: d.url,
          format: d.format,
          uploadedAt: d.uploadedAt.toISOString(),
        })),
        verifications: kycVerifications.map((v) => ({
          id: v.id,
          type: v.type,
          status: v.status,
          verifiedName: v.verifiedName,
          responsePayload: v.responsePayload,
          createdAt: v.createdAt.toISOString(),
        })),
        onboardingDocs: onboardDocs.map((v) => {
          const payload = (v.requestPayload ?? {}) as Record<string, unknown>;
          return {
            id: v.id,
            type: v.type.replace("DOCUMENT_", "").replace("ONBOARD_", ""),
            originalType: v.type,
            status: v.status,
            url: (payload.url as string) ?? null,
            format: (payload.format as string) ?? null,
            publicId: (payload.publicId as string) ?? null,
            resourceType: (payload.resourceType as string) ?? "image",
            gpsLatitude: (payload.gpsLatitude as number) ?? null,
            gpsLongitude: (payload.gpsLongitude as number) ?? null,
            createdAt: v.createdAt.toISOString(),
          };
        }),
      };
    }),
    stats: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    },
  });
}
