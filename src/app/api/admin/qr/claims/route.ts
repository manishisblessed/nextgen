import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";
import { getQrClaimOverview, secondApprovalThreshold } from "@/lib/qr/claims";
import type { Prisma, QrClaimStatus, QrSettlementKind } from "@prisma/client";

/**
 * Admin — QR claim review queue.
 *   GET ?status=PENDING|AWAITING_SECOND_APPROVAL|APPROVED|REJECTED|CLAWED_BACK|ALL
 *       &kind=INSTANT|T1  (optional — split the queue by settlement stream)
 * Default shows everything awaiting action. Screenshot URLs are short-lived
 * signed links (assets are private in Cloudinary).
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const REVIEWABLE: QrClaimStatus[] = ["PENDING", "AWAITING_SECOND_APPROVAL"];
const ALL: QrClaimStatus[] = [
  "PENDING",
  "AWAITING_SECOND_APPROVAL",
  "APPROVED",
  "SETTLEABLE",
  "SETTLED",
  "REJECTED",
  "CLAWED_BACK",
];

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    return toErrorResponse(e);
  }

  const params = new URL(req.url).searchParams;
  const statusParam = params.get("status");
  const statuses: QrClaimStatus[] =
    !statusParam || statusParam === "REVIEWABLE"
      ? REVIEWABLE
      : statusParam === "ALL"
        ? ALL
        : ALL.includes(statusParam as QrClaimStatus)
          ? [statusParam as QrClaimStatus]
          : REVIEWABLE;

  const kindParam = params.get("kind")?.toUpperCase();
  const kind: QrSettlementKind | undefined =
    kindParam === "INSTANT" ? "INSTANT" : kindParam === "T1" ? "T1" : undefined;

  const where: Prisma.QrClaimWhereInput = { status: { in: statuses } };
  if (kind) where.settlementKind = kind;

  const [claims, overview] = await Promise.all([
    prisma.qrClaim.findMany({
      where,
      orderBy: { createdAt: "asc" }, // oldest first — FIFO review
      take: 200,
      include: {
        user: { select: { id: true, userCode: true, name: true, phone: true, shopName: true } },
        qr: { select: { label: true, upiVpa: true } },
        reviewedBy: { select: { id: true, name: true, userCode: true } },
        firstApprovedBy: { select: { id: true, name: true, userCode: true } },
      },
    }),
    getQrClaimOverview(kind),
  ]);

  return NextResponse.json({
    overview,
    secondApprovalThreshold: secondApprovalThreshold(),
    claims: claims.map((c) => ({
      id: c.id,
      retailer: c.user,
      qrLabel: c.qr.label,
      qrVpa: c.qr.upiVpa,
      settlementKind: c.settlementKind,
      amount: Number(c.amount),
      utr: c.utr,
      cardLast4: c.cardLast4,
      paidAt: c.paidAt?.toISOString() ?? null,
      status: c.status,
      reviewNote: c.reviewNote,
      // Maker-checker reconciliation trail: who approved (and, for large
      // amounts, who gave the first approval), each with a stable user code.
      firstApprovedById: c.firstApprovedById,
      firstApprovedBy: c.firstApprovedBy?.name ?? null,
      firstApprovedByCode: c.firstApprovedBy?.userCode ?? null,
      firstApprovedAt: c.firstApprovedAt?.toISOString() ?? null,
      reviewedById: c.reviewedById,
      reviewedBy: c.reviewedBy?.name ?? null,
      reviewedByCode: c.reviewedBy?.userCode ?? null,
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      // The private screenshot is fetched on demand through a per-claim endpoint
      // that mints a FRESH signed URL each click (see [id]/screenshot) — so the
      // "View" button never goes stale, unlike a link baked into this payload.
    })),
  });
}
