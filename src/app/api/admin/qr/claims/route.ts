import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { signedDeliveryUrl } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";
import { getQrClaimOverview, secondApprovalThreshold } from "@/lib/qr/claims";
import type { QrClaimStatus } from "@prisma/client";

/**
 * Admin — QR claim review queue.
 *   GET ?status=PENDING|AWAITING_SECOND_APPROVAL|APPROVED|REJECTED|CLAWED_BACK|ALL
 * Default shows everything awaiting action. Screenshot URLs are short-lived
 * signed links (assets are private in Cloudinary).
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const REVIEWABLE: QrClaimStatus[] = ["PENDING", "AWAITING_SECOND_APPROVAL"];
const ALL: QrClaimStatus[] = ["PENDING", "AWAITING_SECOND_APPROVAL", "APPROVED", "REJECTED", "CLAWED_BACK"];

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    return toErrorResponse(e);
  }

  const statusParam = new URL(req.url).searchParams.get("status");
  const statuses: QrClaimStatus[] =
    !statusParam || statusParam === "REVIEWABLE"
      ? REVIEWABLE
      : statusParam === "ALL"
        ? ALL
        : ALL.includes(statusParam as QrClaimStatus)
          ? [statusParam as QrClaimStatus]
          : REVIEWABLE;

  const [claims, overview] = await Promise.all([
    prisma.qrClaim.findMany({
      where: { status: { in: statuses } },
      orderBy: { createdAt: "asc" }, // oldest first — FIFO review
      take: 200,
      include: {
        user: { select: { id: true, name: true, phone: true, shopName: true } },
        qr: { select: { label: true, upiVpa: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
    getQrClaimOverview(),
  ]);

  return NextResponse.json({
    overview,
    secondApprovalThreshold: secondApprovalThreshold(),
    claims: claims.map((c) => ({
      id: c.id,
      retailer: c.user,
      qrLabel: c.qr.label,
      qrVpa: c.qr.upiVpa,
      amount: Number(c.amount),
      utr: c.utr,
      paidAt: c.paidAt.toISOString(),
      status: c.status,
      firstApprovedById: c.firstApprovedById,
      reviewNote: c.reviewNote,
      reviewedBy: c.reviewedBy?.name ?? null,
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      // 5-minute signed link for the private screenshot.
      screenshotUrl: signedDeliveryUrl(c.screenshotPublicId, {
        format: c.screenshotFormat ?? "jpg",
        expiresInSec: 300,
      }),
    })),
  });
}
