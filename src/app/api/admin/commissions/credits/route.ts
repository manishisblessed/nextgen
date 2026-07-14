import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commissions/credits
 *
 * Admin view of all commission credits across the platform. Filterable by
 * userId, service, tier, date range. Supports pagination and summary stats.
 */
export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "FINANCE");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const service = url.searchParams.get("service");
  const tier = url.searchParams.get("tier");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (service) where.service = service;
  if (tier) where.tier = tier;
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00.000+05:30`);
    if (to) createdAt.lte = new Date(`${to}T23:59:59.999+05:30`);
    where.createdAt = createdAt;
  }

  const [total, rows, tierAgg] = await Promise.all([
    prisma.commissionCredit.count({ where }),
    prisma.commissionCredit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, role: true } },
        transaction: { select: { refId: true, service: true, amount: true } },
      },
    }),
    prisma.commissionCredit.groupBy({
      by: ["tier"],
      where,
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    credits: rows.map((c) => ({
      id: c.id,
      user: { id: c.user.id, name: c.user.name, role: c.user.role },
      tier: c.tier,
      amount: toNumber(c.amount),
      service: c.service,
      txnAmount: toNumber(c.txnAmount),
      txnRefId: c.transaction?.refId,
      schemeId: c.schemeId,
      createdAt: c.createdAt.toISOString(),
    })),
    summary: {
      byTier: tierAgg.map((t) => ({
        tier: t.tier,
        total: toNumber(t._sum.amount ?? 0),
        count: t._count,
      })),
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
