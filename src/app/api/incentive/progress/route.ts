import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { getUserIncentiveProgress } from "@/lib/incentive/engine";
import { serializePayout } from "@/lib/incentive/serialize";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/incentive/progress?leg=INSTANT|T1|BOTH
 *
 * Retailer-facing view of the monthly reward programme: live current-month tier
 * progress for every incentive scheme the caller is assigned to (with a per-leg
 * breakdown), plus their recent reward payout history. The optional `leg` filter
 * scopes the payout history + totals to one settlement leg or both (default).
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const legParam = new URL(req.url).searchParams.get("leg")?.toUpperCase();
  const leg = legParam === "INSTANT" || legParam === "T1" ? legParam : "BOTH";

  const [progress, payouts] = await Promise.all([
    getUserIncentiveProgress(user.id),
    prisma.incentivePayout.findMany({
      where: {
        userId: user.id,
        status: "PAID",
        ...(leg === "BOTH" ? {} : { leg }),
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: { scheme: { select: { name: true } } },
    }),
  ]);

  const totalEarned = payouts.reduce((s, p) => s + Number(p.rewardAmount), 0);

  return NextResponse.json({
    leg,
    schemes: progress,
    payouts: payouts.map((p) => ({
      ...serializePayout(p),
      schemeName: p.scheme.name,
    })),
    totalEarned,
  });
}
