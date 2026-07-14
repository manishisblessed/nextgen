import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/network/earnings
 *
 * Returns the caller's commission earnings — aggregated and detailed.
 * Shows how much commission was earned from their own transactions
 * and from their downline's transactions.
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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 25));
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { userId: user.id };
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00.000+05:30`);
    if (to) createdAt.lte = new Date(`${to}T23:59:59.999+05:30`);
    where.createdAt = createdAt;
  }

  const [total, credits, agg, serviceAgg] = await Promise.all([
    prisma.commissionCredit.count({ where }),
    prisma.commissionCredit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        transaction: {
          select: { refId: true, service: true, amount: true, customer: true, userId: true },
        },
      },
    }),
    prisma.commissionCredit.aggregate({
      where: { userId: user.id },
      _sum: { amount: true, grossAmount: true, tdsAmount: true },
      _count: true,
    }),
    prisma.commissionCredit.groupBy({
      by: ["service"],
      where: { userId: user.id },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    totalEarnings: toNumber(agg._sum.amount ?? 0),
    totalGross: toNumber(agg._sum.grossAmount ?? 0),
    totalTds: toNumber(agg._sum.tdsAmount ?? 0),
    totalCredits: agg._count,
    byService: serviceAgg.map((s) => ({
      service: s.service,
      amount: toNumber(s._sum.amount ?? 0),
      count: s._count,
    })),
    credits: credits.map((c) => ({
      id: c.id,
      tier: c.tier,
      amount: toNumber(c.amount),
      grossAmount: c.grossAmount !== null ? toNumber(c.grossAmount) : null,
      tdsAmount: toNumber(c.tdsAmount),
      service: c.service,
      txnAmount: toNumber(c.txnAmount),
      txnRefId: c.transaction?.refId,
      txnUserId: c.transaction?.userId,
      customer: c.transaction?.customer,
      createdAt: c.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
