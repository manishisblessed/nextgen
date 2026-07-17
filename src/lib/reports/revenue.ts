import type { ServiceCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { add, dec, toNumber, type Money } from "@/lib/money";
import { istDayBounds } from "./daily";

export type ServiceRevenueRow = {
  service: ServiceCode;
  txnCount: number;
  totalVolume: number;
  totalCharge: number;
  grossCommission: number;
  tdsCollected: number;
  netCommission: number;
  platformRevenue: number;
};

export type TierCommissionRow = {
  tier: string;
  gross: number;
  tds: number;
  net: number;
  creditCount: number;
};

export type DailyRevenueRow = {
  date: string;
  txnCount: number;
  totalVolume: number;
  totalCharge: number;
  grossCommission: number;
  tdsCollected: number;
  netCommission: number;
  platformRevenue: number;
};

export type RevenueReport = {
  from: string;
  to: string;
  byService: ServiceRevenueRow[];
  byTier: TierCommissionRow[];
  byDay: DailyRevenueRow[];
  totals: {
    txnCount: number;
    totalVolume: number;
    totalCharge: number;
    grossCommission: number;
    tdsCollected: number;
    netCommission: number;
    platformRevenue: number;
  };
};

export type RevenueReportParams = {
  from?: string | null;
  to?: string | null;
  service?: string | null;
};

export async function getRevenueReport(
  params: RevenueReportParams
): Promise<RevenueReport> {
  const fromBounds = istDayBounds(params.from ?? undefined);
  const toBounds = istDayBounds(params.to ?? params.from ?? undefined);

  const dateStart = fromBounds.dayStart;
  const dateEnd = toBounds.dayEnd;

  const serviceFilter = params.service
    ? { service: params.service as ServiceCode }
    : {};

  const [serviceAgg, commissionByService, commissionByTier, dailyTxns, dailyCommissions] =
    await Promise.all([
      prisma.transaction.groupBy({
        by: ["service"],
        where: {
          status: "SUCCESS",
          createdAt: { gte: dateStart, lte: dateEnd },
          ...serviceFilter,
        },
        _count: { _all: true },
        _sum: { amount: true, fee: true },
      }),

      prisma.commissionCredit.groupBy({
        by: ["service"],
        where: {
          createdAt: { gte: dateStart, lte: dateEnd },
          ...serviceFilter,
        },
        _sum: { amount: true, grossAmount: true, tdsAmount: true },
      }),

      prisma.commissionCredit.groupBy({
        by: ["tier"],
        where: {
          createdAt: { gte: dateStart, lte: dateEnd },
          ...serviceFilter,
        },
        _sum: { amount: true, grossAmount: true, tdsAmount: true },
        _count: true,
      }),

      fetchDailyTxns(dateStart, dateEnd, params.service ?? null),

      fetchDailyCommissions(dateStart, dateEnd, params.service ?? null),
    ]);

  const commByServiceMap = new Map(
    commissionByService.map((c) => [
      c.service,
      {
        gross: toNumber(dec(c._sum.grossAmount ?? c._sum.amount ?? 0)),
        tds: toNumber(dec(c._sum.tdsAmount ?? 0)),
        net: toNumber(dec(c._sum.amount ?? 0)),
      },
    ])
  );

  const byService: ServiceRevenueRow[] = serviceAgg
    .map((s) => {
      const totalCharge = toNumber(dec(s._sum.fee ?? 0));
      const comm = commByServiceMap.get(s.service) ?? {
        gross: 0,
        tds: 0,
        net: 0,
      };
      return {
        service: s.service,
        txnCount: s._count._all,
        totalVolume: toNumber(dec(s._sum.amount ?? 0)),
        totalCharge,
        grossCommission: comm.gross,
        tdsCollected: comm.tds,
        netCommission: comm.net,
        platformRevenue: round2(totalCharge - comm.gross),
      };
    })
    .sort((a, b) => b.totalVolume - a.totalVolume);

  const byTier: TierCommissionRow[] = commissionByTier
    .map((t) => ({
      tier: t.tier,
      gross: toNumber(dec(t._sum.grossAmount ?? t._sum.amount ?? 0)),
      tds: toNumber(dec(t._sum.tdsAmount ?? 0)),
      net: toNumber(dec(t._sum.amount ?? 0)),
      creditCount: t._count,
    }))
    .sort((a, b) => b.net - a.net);

  const dailyCommMap = new Map(
    dailyCommissions.map((d) => [
      d.day,
      {
        gross: parseFloat(d.gross),
        tds: parseFloat(d.tds),
        net: parseFloat(d.net),
      },
    ])
  );

  const byDay: DailyRevenueRow[] = dailyTxns.map((d) => {
    const charge = parseFloat(d.charge);
    const comm = dailyCommMap.get(d.day) ?? { gross: 0, tds: 0, net: 0 };
    return {
      date: d.day,
      txnCount: Number(d.count),
      totalVolume: parseFloat(d.volume),
      totalCharge: charge,
      grossCommission: comm.gross,
      tdsCollected: comm.tds,
      netCommission: comm.net,
      platformRevenue: round2(charge - comm.gross),
    };
  });

  const totals = {
    txnCount: byService.reduce((n, r) => n + r.txnCount, 0),
    totalVolume: sumRound(byService.map((r) => r.totalVolume)),
    totalCharge: sumRound(byService.map((r) => r.totalCharge)),
    grossCommission: sumRound(byService.map((r) => r.grossCommission)),
    tdsCollected: sumRound(byService.map((r) => r.tdsCollected)),
    netCommission: sumRound(byService.map((r) => r.netCommission)),
    platformRevenue: sumRound(byService.map((r) => r.platformRevenue)),
  };

  return {
    from: fromBounds.ymd,
    to: toBounds.ymd,
    byService,
    byTier,
    byDay,
    totals,
  };
}

function sumRound(values: number[]): number {
  let s: Money = dec(0);
  for (const v of values) s = add(s, dec(v));
  return toNumber(s);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type DailyTxnRow = { day: string; count: bigint; volume: string; charge: string };
type DailyCommRow = { day: string; gross: string; tds: string; net: string };

async function fetchDailyTxns(
  from: Date,
  to: Date,
  service: string | null
): Promise<DailyTxnRow[]> {
  if (service) {
    return prisma.$queryRaw<DailyTxnRow[]>`
      SELECT
        TO_CHAR("createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
        COUNT(*)::bigint AS count,
        COALESCE(SUM(amount), 0)::text AS volume,
        COALESCE(SUM(fee), 0)::text AS charge
      FROM "Transaction"
      WHERE status = 'SUCCESS'
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND service = ${service}::"ServiceCode"
      GROUP BY day ORDER BY day
    `;
  }
  return prisma.$queryRaw<DailyTxnRow[]>`
    SELECT
      TO_CHAR("createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS count,
      COALESCE(SUM(amount), 0)::text AS volume,
      COALESCE(SUM(fee), 0)::text AS charge
    FROM "Transaction"
    WHERE status = 'SUCCESS'
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY day ORDER BY day
  `;
}

async function fetchDailyCommissions(
  from: Date,
  to: Date,
  service: string | null
): Promise<DailyCommRow[]> {
  if (service) {
    return prisma.$queryRaw<DailyCommRow[]>`
      SELECT
        TO_CHAR("createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
        COALESCE(SUM("grossAmount"), 0)::text AS gross,
        COALESCE(SUM("tdsAmount"), 0)::text AS tds,
        COALESCE(SUM(amount), 0)::text AS net
      FROM "CommissionCredit"
      WHERE "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND service = ${service}::"ServiceCode"
      GROUP BY day ORDER BY day
    `;
  }
  return prisma.$queryRaw<DailyCommRow[]>`
    SELECT
      TO_CHAR("createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
      COALESCE(SUM("grossAmount"), 0)::text AS gross,
      COALESCE(SUM("tdsAmount"), 0)::text AS tds,
      COALESCE(SUM(amount), 0)::text AS net
    FROM "CommissionCredit"
    WHERE "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY day ORDER BY day
  `;
}
