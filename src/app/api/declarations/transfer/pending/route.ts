import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET — List transfer requests where the current user is the designated new
 * parent (i.e. needs to provide declaration approval). Returns both pending
 * and completed for history.
 */
export async function GET() {
  const user = await requireAuth();

  const transfers = await prisma.hierarchyTransfer.findMany({
    where: { newParentId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      reason: true,
      user: { select: { id: true, userCode: true, name: true, role: true, phone: true, email: true, shopName: true } },
      oldParent: { select: { id: true, name: true, role: true } },
      initiatedBy: { select: { id: true, name: true } },
      approvedAt: true,
      rejectedAt: true,
      rejectedReason: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // Auto-expire stale transfers
  const now = new Date();
  const expired = transfers.filter(
    (t) => t.status === "PENDING_DECLARATION" && new Date(t.expiresAt) < now
  );
  if (expired.length > 0) {
    await prisma.hierarchyTransfer.updateMany({
      where: { id: { in: expired.map((t) => t.id) } },
      data: { status: "EXPIRED" },
    });
    for (const t of expired) {
      (t as any).status = "EXPIRED";
    }
  }

  return NextResponse.json({ transfers });
}
