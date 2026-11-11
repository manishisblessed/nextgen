import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { dec, toNumber } from "@/lib/money";
import { istDayBounds } from "@/lib/reports/daily";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * Retailer PG overview — real PgSettlementEntry data for the dashboard.
 *
 * Returns today's stats (collections, volume, success rate, pending settlement)
 * plus a paginated list of recent PG settlement entries.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`pg:overview:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));

    const today = istDayBounds();
    const dayStart = today.dayStart;
    const dayEnd = today.dayEnd;
    const todayRange = { gte: dayStart, lte: dayEnd };
    const capturedToday = {
      OR: [
        { capturedAt: todayRange },
        { capturedAt: null, createdAt: todayRange },
      ],
    };

    const self = { userId: user.id };

    const [
      todayByStatus,
      totalEntries,
      recentEntries,
      pendingAgg,
    ] = await Promise.all([
      // Today's settlement stats grouped by status.
      prisma.pgSettlementEntry.groupBy({
        by: ["status"],
        where: { ...self, ...capturedToday },
        _count: true,
        _sum: { grossAmount: true, netAmount: true, mdrAmount: true },
      }),
      // Total entries count (for pagination).
      prisma.pgSettlementEntry.count({ where: self }),
      // Paginated recent entries.
      prisma.pgSettlementEntry.findMany({
        where: self,
        orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        select: {
          id: true,
          transactionRef: true,
          orderId: true,
          grossAmount: true,
          mdrAmount: true,
          netAmount: true,
          paymentMode: true,
          provider: true,
          status: true,
          mode: true,
          capturedAt: true,
          createdAt: true,
          settledAt: true,
        },
      }),
      // Pending settlement total.
      prisma.pgSettlementEntry.aggregate({
        where: { ...self, status: "PENDING" },
        _sum: { netAmount: true },
        _count: true,
      }),
    ]);

    // Compute today's summary.
    let todayCount = 0;
    let todayVolume = dec(0);
    let todayFees = dec(0);
    let todaySettled = 0;

    for (const row of todayByStatus) {
      todayCount += row._count;
      todayVolume = todayVolume.add(dec(row._sum.grossAmount ?? 0));
      todayFees = todayFees.add(dec(row._sum.mdrAmount ?? 0));
      if (row.status === "SETTLED") todaySettled += row._count;
    }

    const successRate = todayCount > 0
      ? Math.round((todaySettled / todayCount) * 1000) / 10
      : 0;

    // Map recent entries.
    const transactions = recentEntries.map((e) => ({
      id: e.id,
      txnId: e.transactionRef,
      orderId: e.orderId ?? "—",
      mode: e.paymentMode ?? "UPI",
      amount: toNumber(e.grossAmount),
      fee: toNumber(e.mdrAmount),
      net: toNumber(e.netAmount),
      status: e.status,
      settlement: e.mode === "INSTANT" ? "Instant" : "T+1",
      gateway: e.provider ?? "—",
      date: (e.capturedAt ?? e.createdAt).toISOString(),
      settledAt: e.settledAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      stats: {
        todayCollections: todayCount,
        todayVolume: toNumber(todayVolume),
        todayFees: toNumber(todayFees),
        successRate,
        pendingSettlement: toNumber(dec(pendingAgg._sum.netAmount ?? 0)),
        pendingCount: pendingAgg._count,
      },
      transactions,
      total: totalEntries,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (e) {
    console.error("[pg/overview] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
