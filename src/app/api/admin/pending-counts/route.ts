import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pending-counts
 *
 * Lightweight aggregate counts for the three admin review queues that drive
 * sidebar badge notifications. Returns the number of items currently awaiting
 * admin action in each queue:
 *
 *   - qrClaims:    QrClaim rows in PENDING or AWAITING_SECOND_APPROVAL
 *   - posBookings: PosBookingRequest rows in APPLIED (paid, awaiting allocation)
 *   - posSlips:    PosManualSlip rows in PENDING (uploaded, awaiting review)
 *
 * All three models have composite indexes on [status, createdAt] so the counts
 * resolve from index scans — no full table walks.
 */
export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
  } catch (e) {
    return toErrorResponse(e);
  }

  const [qrClaims, posBookings, posSlips] = await Promise.all([
    prisma.qrClaim.count({
      where: { status: { in: ["PENDING", "AWAITING_SECOND_APPROVAL"] } },
    }),
    prisma.posBookingRequest.count({ where: { status: "APPLIED" } }),
    prisma.posManualSlip.count({ where: { status: "PENDING" } }),
  ]);

  return NextResponse.json({ qrClaims, posBookings, posSlips });
}
