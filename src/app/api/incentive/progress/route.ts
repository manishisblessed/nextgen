import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { getUserIncentiveProgress } from "@/lib/incentive/engine";
import { serializePayout } from "@/lib/incentive/serialize";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/incentive/progress
 *
 * Retailer-facing view of the monthly reward programme: live current-month tier
 * progress for every incentive scheme the caller is assigned to, plus their
 * recent reward payout history.
 */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const [progress, payouts] = await Promise.all([
    getUserIncentiveProgress(user.id),
    prisma.incentivePayout.findMany({
      where: { userId: user.id, status: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { scheme: { select: { name: true } } },
    }),
  ]);

  const totalEarned = payouts.reduce((s, p) => s + Number(p.rewardAmount), 0);

  return NextResponse.json({
    schemes: progress,
    payouts: payouts.map((p) => ({
      ...serializePayout(p),
      schemeName: p.scheme.name,
    })),
    totalEarned,
  });
}
