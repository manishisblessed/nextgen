import { prisma } from "@/lib/db";
import { dec, sub, toNumber, type Money } from "@/lib/money";
import type { PayinPeriod } from "@/lib/wallet/payin";

/**
 * Admin PG reporting — the live view of the Payment Gateway acquiring rail,
 * read straight from `PgSettlementEntry` (the single source the live payin PG
 * rail also reads). Covers Chagans wallet top-ups and any other PG capture: each
 * entry carries gross, scheme MDR, net credited, and the live acquirer (vendor)
 * cost, so company revenue (margin) = MDR − vendor.
 */

export type PgReportStats = {
  /** Settlement entries in the window. */
  count: number;
  /** Gross merchandise value — total collected (₹). */
  gmv: number;
  /** Scheme MDR deducted across the window (₹). */
  mdrTotal: number;
  /** Acquirer (vendor) cost across the window (₹). */
  vendorTotal: number;
  /** Company revenue = MDR − vendor (₹). */
  mdrRevenue: number;
  /** Net credited to retailers (₹). */
  netSettled: number;
  settledCount: number;
  pendingCount: number;
  failedCount: number;
  /** Settled ÷ total, as a percentage (0–100); null when no entries. */
  successRate: number | null;
  /** Distinct retailers transacting in the window. */
  activeRetailers: number;
};

export type PgTxnRow = {
  ref: string;
  orderId: string | null;
  userId: string;
  userCode: string | null;
  name: string;
  shopName: string | null;
  gross: number;
  mdr: number;
  vendor: number;
  margin: number;
  net: number;
  paymentMode: string | null;
  provider: string | null;
  mode: string;
  status: string;
  settledAt: string | null;
  capturedAt: string | null;
  createdAt: string;
};

export type PgRetailerRow = {
  userId: string;
  userCode: string | null;
  name: string;
  shopName: string | null;
  role: string;
  count: number;
  gross: number;
  net: number;
  margin: number;
  lastAt: string | null;
};

export type PgReport = {
  period: PayinPeriod;
  since: string;
  asOf: string;
  stats: PgReportStats;
  transactions: PgTxnRow[];
  byRetailer: PgRetailerRow[];
};

/** Start of the CURRENT IST period, as a UTC Date (mirrors wallet/payin.ts). */
function istPeriodStart(period: PayinPeriod, now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const year = ist.getUTCFullYear();
  let month = ist.getUTCMonth();
  let day = ist.getUTCDate();
  switch (period) {
    case "today":
      break;
    case "week":
      day -= (ist.getUTCDay() + 6) % 7; // Monday-based week
      break;
    case "month":
      day = 1;
      break;
    case "year":
      month = 0;
      day = 1;
      break;
  }
  return new Date(Date.UTC(year, month, day) - 5.5 * 60 * 60 * 1000);
}

const marginOf = (mdr: Money, vendor: Money): Money => {
  const m = sub(mdr, vendor);
  return m.gt(0) ? m : dec(0);
};

/**
 * Build the admin PG dashboard payload for an IST period: headline stats, the
 * recent settlement feed (capped), and a per-retailer rollup (top by GMV).
 */
export async function getPgReport(period: PayinPeriod): Promise<PgReport> {
  const since = istPeriodStart(period);
  const asOf = new Date().toISOString();
  const where = { createdAt: { gte: since } };

  const [totals, byStatus, distinctRetailers, grouped, recent] = await Promise.all([
    prisma.pgSettlementEntry.aggregate({
      where,
      _sum: { grossAmount: true, mdrAmount: true, vendorAmount: true, netAmount: true },
      _count: true,
    }),
    prisma.pgSettlementEntry.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.pgSettlementEntry.findMany({
      where,
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.pgSettlementEntry.groupBy({
      by: ["userId"],
      where,
      _sum: { grossAmount: true, netAmount: true, mdrAmount: true, vendorAmount: true },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.pgSettlementEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { userCode: true, name: true, shopName: true, role: true } },
      },
    }),
  ]);

  const gmv = dec(totals._sum.grossAmount ?? 0);
  const mdrTotal = dec(totals._sum.mdrAmount ?? 0);
  const vendorTotal = dec(totals._sum.vendorAmount ?? 0);
  const netSettled = dec(totals._sum.netAmount ?? 0);
  const count = totals._count;

  const statusCount = (s: string) =>
    byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const settledCount = statusCount("SETTLED");
  const pendingCount = statusCount("PENDING");
  const failedCount = statusCount("FAILED");

  const stats: PgReportStats = {
    count,
    gmv: toNumber(gmv),
    mdrTotal: toNumber(mdrTotal),
    vendorTotal: toNumber(vendorTotal),
    mdrRevenue: toNumber(marginOf(mdrTotal, vendorTotal)),
    netSettled: toNumber(netSettled),
    settledCount,
    pendingCount,
    failedCount,
    successRate: count > 0 ? Math.round((settledCount / count) * 1000) / 10 : null,
    activeRetailers: distinctRetailers.length,
  };

  // Per-retailer rollup — join user info for the grouped userIds.
  const userIds = grouped.map((g) => g.userId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, userCode: true, name: true, shopName: true, role: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const byRetailer: PgRetailerRow[] = grouped
    .map((g) => {
      const u = userById.get(g.userId);
      const gross = dec(g._sum.grossAmount ?? 0);
      const net = dec(g._sum.netAmount ?? 0);
      const margin = marginOf(dec(g._sum.mdrAmount ?? 0), dec(g._sum.vendorAmount ?? 0));
      return {
        userId: g.userId,
        userCode: u?.userCode ?? null,
        name: u?.name ?? "Unknown",
        shopName: u?.shopName ?? null,
        role: u?.role ?? "—",
        count: g._count._all,
        gross: toNumber(gross),
        net: toNumber(net),
        margin: toNumber(margin),
        lastAt: g._max.createdAt ? g._max.createdAt.toISOString() : null,
      };
    })
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 100);

  const transactions: PgTxnRow[] = recent.map((e) => {
    const mdr = dec(e.mdrAmount);
    const vendor = dec(e.vendorAmount ?? 0);
    return {
      ref: e.transactionRef,
      orderId: e.orderId,
      userId: e.userId,
      userCode: e.user?.userCode ?? null,
      name: e.user?.name ?? "Unknown",
      shopName: e.user?.shopName ?? null,
      gross: toNumber(dec(e.grossAmount)),
      mdr: toNumber(mdr),
      vendor: toNumber(vendor),
      margin: toNumber(marginOf(mdr, vendor)),
      net: toNumber(dec(e.netAmount)),
      paymentMode: e.paymentMode,
      provider: e.provider,
      mode: e.mode,
      status: e.status,
      settledAt: e.settledAt ? e.settledAt.toISOString() : null,
      capturedAt: e.capturedAt ? e.capturedAt.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
    };
  });

  return { period, since: since.toISOString(), asOf, stats, transactions, byRetailer };
}
