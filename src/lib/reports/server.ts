/**
 * Server-side report query layer.
 *
 * One pure function per report. Every query is:
 *   - ownership-scoped via self+downline ids (admins see all) — reusing the
 *     ownership primitives (isAdminRole + getDescendantIds);
 *   - date-range + filter aware;
 *   - aggregated and paginated in the database (indexed columns), never in JS;
 *   - summed with Prisma.Decimal through the money helpers (never Number()).
 *
 * The only place a JS float is used is the sparkline `trend` series, which is
 * a purely visual approximation (cast to float8 in SQL) and is never reported
 * as an authoritative total.
 */
import {
  Prisma,
  type ServiceCode,
  type TxnStatus,
  type PayoutStatus,
  type PayoutMode,
  type FundRequestStatus,
  type WalletDirection,
  type WalletReason,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { dec, add, sub, toNumber } from "@/lib/money";
import { isAdminRole, getDescendantIds } from "@/lib/security/ownership";
import { flags } from "@/lib/env";
import type { SessionUser } from "@/lib/auth-server";
import type {
  ReportParams,
  ReportResult,
  ReportSummaryStat,
  ReportTrend,
  ReportType,
} from "./types";
import { EXPORT_ROW_CAP } from "./types";

/* --------------------------------------------------------------------- */
/*  Shared helpers                                                        */
/* --------------------------------------------------------------------- */

/** Allowed user ids for `user`: null = admin (everything), else self+downline. */
async function allowedUserIds(user: SessionUser): Promise<string[] | null> {
  if (isAdminRole(user.role)) return null;
  const descendants = await getDescendantIds(user.id);
  return [user.id, ...descendants];
}

/** Build a `createdAt` (or any date column) range filter, or undefined. */
function dateFilter(params: ReportParams): { gte?: Date; lte?: Date } | undefined {
  if (!params.from && !params.to) return undefined;
  const f: { gte?: Date; lte?: Date } = {};
  if (params.from) f.gte = params.from;
  if (params.to) f.lte = params.to;
  return f;
}

/** Range with sane defaults (last 30 days) — used for the visual trend only. */
function effectiveRange(params: ReportParams): { from: Date; to: Date } {
  const to = params.to ?? new Date();
  const from = params.from ?? new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

/** take/skip for a list query; exports pull a single capped page. */
function paginate(params: ReportParams): { take: number; skip: number } {
  if (params.forExport) return { take: EXPORT_ROW_CAP, skip: 0 };
  return { take: params.pageSize, skip: (params.page - 1) * params.pageSize };
}

const ACRONYMS = new Set([
  "AEPS", "DMT", "UPI", "DTH", "PAN", "GST", "IMPS", "NEFT", "RTGS",
  "POS", "QR", "PG", "BBPS", "ID",
]);

/** Turn an enum code (AEPS_WITHDRAW) into a label ("AEPS Withdraw"). */
function humanize(code: string): string {
  return code
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

function inr(value: Prisma.Decimal | number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function trendToSeries(
  points: { value: number }[],
  label: string,
  color: string
): ReportTrend | null {
  if (points.length < 2) return null;
  return { label, color, values: points.map((p) => p.value) };
}

/**
 * Generic indexed daily-sum series for a sparkline. Table / column / value
 * expressions are compile-time constants from this file (never user input),
 * so Prisma.raw interpolation is safe here.
 */
async function dailyTrend(opts: {
  table: string;
  dateCol: string;
  valueExpr: string;
  userCol: string;
  ids: string[] | null;
  from: Date;
  to: Date;
  extra?: Prisma.Sql;
}): Promise<{ label: string; value: number }[]> {
  const userCond =
    opts.ids === null || opts.ids.length === 0
      ? Prisma.empty
      : Prisma.sql`AND ${Prisma.raw(`"${opts.userCol}"`)} IN (${Prisma.join(opts.ids)})`;
  const extra = opts.extra ?? Prisma.empty;

  const rows = await prisma.$queryRaw<{ day: Date; total: number }[]>(Prisma.sql`
    SELECT date_trunc('day', ${Prisma.raw(`"${opts.dateCol}"`)}) AS day,
           COALESCE(SUM(${Prisma.raw(opts.valueExpr)}), 0)::float8 AS total
    FROM ${Prisma.raw(`"${opts.table}"`)}
    WHERE ${Prisma.raw(`"${opts.dateCol}"`)} >= ${opts.from}
      AND ${Prisma.raw(`"${opts.dateCol}"`)} <= ${opts.to}
      ${userCond}
      ${extra}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((r) => ({
    label: new Date(r.day).toISOString().slice(0, 10),
    value: Number(r.total),
  }));
}

function money(label: string, value: Prisma.Decimal | number, accent: ReportSummaryStat["accent"] = "brand"): ReportSummaryStat {
  return { label, value: inr(value), accent };
}
function count(label: string, value: number, accent: ReportSummaryStat["accent"] = "violet"): ReportSummaryStat {
  return { label, value: value.toLocaleString("en-IN"), accent };
}
function percent(label: string, value: number, accent: ReportSummaryStat["accent"] = "emerald"): ReportSummaryStat {
  return { label, value: `${value.toFixed(1)}%`, accent };
}

/* --------------------------------------------------------------------- */
/*  1 · Summary (service-wise turnover)                                   */
/* --------------------------------------------------------------------- */

async function reportSummary(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const where: Prisma.TransactionWhereInput = {
    ...(ids ? { userId: { in: ids } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(params.service ? { service: params.service as ServiceCode } : {}),
  };

  const grouped = await prisma.transaction.groupBy({
    by: ["service", "status"],
    where,
    _sum: { amount: true, fee: true, commission: true, gst: true },
    _count: { _all: true },
  });

  type Agg = {
    service: string;
    txns: number;
    success: number;
    failed: number;
    gross: Prisma.Decimal;
    fee: Prisma.Decimal;
    commission: Prisma.Decimal;
  };
  const map = new Map<string, Agg>();
  for (const g of grouped) {
    const r =
      map.get(g.service) ??
      { service: g.service, txns: 0, success: 0, failed: 0, gross: dec(0), fee: dec(0), commission: dec(0) };
    r.txns += g._count._all;
    if (g.status === "SUCCESS") {
      r.success += g._count._all;
      r.gross = add(r.gross, g._sum.amount ?? 0);
      r.fee = add(r.fee, g._sum.fee ?? 0);
      r.commission = add(r.commission, g._sum.commission ?? 0);
    } else if (g.status === "FAILED") {
      r.failed += g._count._all;
    }
    map.set(g.service, r);
  }

  const aggs = [...map.values()].sort((a, b) => b.gross.cmp(a.gross));

  let tGross = dec(0), tFee = dec(0), tComm = dec(0);
  let tTxn = 0, tSucc = 0, tFail = 0;
  for (const r of aggs) {
    tGross = add(tGross, r.gross);
    tFee = add(tFee, r.fee);
    tComm = add(tComm, r.commission);
    tTxn += r.txns;
    tSucc += r.success;
    tFail += r.failed;
  }

  const allRows = aggs.map((r) => ({
    service: humanize(r.service),
    txns: r.txns,
    success: r.success,
    failed: r.failed,
    successRate: r.txns ? Math.round((r.success / r.txns) * 1000) / 10 : 0,
    gross: toNumber(r.gross),
    fee: toNumber(r.fee),
    commission: toNumber(r.commission),
  }));

  const total = allRows.length;
  const rows = params.forExport
    ? allRows
    : allRows.slice((params.page - 1) * params.pageSize, (params.page - 1) * params.pageSize + params.pageSize);

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({
      table: "Transaction", dateCol: "createdAt", valueExpr: `"amount"`, userCol: "userId",
      ids, from, to, extra: Prisma.sql`AND "status" = 'SUCCESS'`,
    }),
    "Daily turnover", "#185df5"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: {
      service: "Total",
      txns: tTxn,
      success: tSucc,
      failed: tFail,
      successRate: tTxn ? Math.round((tSucc / tTxn) * 1000) / 10 : 0,
      gross: toNumber(tGross),
      fee: toNumber(tFee),
      commission: toNumber(tComm),
    },
    summary: [
      money("Net turnover", tGross, "brand"),
      money("Commissions", tComm, "emerald"),
      count("Successful txns", tSucc, "violet"),
      percent("Failure rate", tTxn ? (tFail / tTxn) * 100 : 0, "accent"),
    ],
    trend,
    note: null,
  };
}

/* --------------------------------------------------------------------- */
/*  2 · Fund (fund requests)                                              */
/* --------------------------------------------------------------------- */

async function reportFund(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const where: Prisma.FundRequestWhereInput = {
    ...(ids ? { requesterId: { in: ids } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(params.status ? { status: params.status as FundRequestStatus } : {}),
    ...(params.mode ? { mode: params.mode } : {}),
    ...(params.q
      ? {
          OR: [
            { utr: { contains: params.q, mode: "insensitive" } },
            { bankName: { contains: params.q, mode: "insensitive" } },
            { requester: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [list, total, allAgg, approvedAgg] = await Promise.all([
    prisma.fundRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { requester: { select: { name: true } } },
      ...paginate(params),
    }),
    prisma.fundRequest.count({ where }),
    prisma.fundRequest.aggregate({ where, _sum: { amount: true } }),
    prisma.fundRequest.aggregate({ where: { ...where, status: "APPROVED" }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  const pending = await prisma.fundRequest.count({ where: { ...where, status: "PENDING" } });

  const requested = dec(allAgg._sum.amount ?? 0);
  const approved = dec(approvedAgg._sum.amount ?? 0);

  const rows = list.map((r) => ({
    date: r.createdAt.toISOString(),
    requester: r.requester?.name ?? "—",
    amount: toNumber(r.amount),
    mode: r.mode,
    utr: r.utr ?? "—",
    bankName: r.bankName ?? "—",
    status: r.status,
  }));

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({ table: "FundRequest", dateCol: "createdAt", valueExpr: `"amount"`, userCol: "requesterId", ids, from, to }),
    "Daily fund requests", "#7c3aed"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: { date: "Total", amount: toNumber(requested) },
    summary: [
      count("Requests", total, "violet"),
      money("Requested", requested, "brand"),
      money("Approved", approved, "emerald"),
      count("Pending", pending, "accent"),
    ],
    trend,
    note: null,
  };
}

/* --------------------------------------------------------------------- */
/*  3 · Payment Gateway (Razorpay / UPI-collect transactions)            */
/* --------------------------------------------------------------------- */

async function reportPg(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const pgMatch: Prisma.TransactionWhereInput = {
    OR: [{ partner: "RAZORPAY" }, { service: "UPI_COLLECT" }],
  };
  const where: Prisma.TransactionWhereInput = {
    AND: [
      pgMatch,
      ...(ids ? [{ userId: { in: ids } }] : []),
      ...(createdAt ? [{ createdAt }] : []),
      ...(params.status ? [{ status: params.status as TxnStatus }] : []),
      ...(params.q
        ? [{
            OR: [
              { refId: { contains: params.q, mode: "insensitive" as const } },
              { customer: { contains: params.q, mode: "insensitive" as const } },
              { partnerTxnId: { contains: params.q, mode: "insensitive" as const } },
            ],
          }]
        : []),
    ],
  };

  const [list, total, agg, successN] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(params) }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true, fee: true } }),
    prisma.transaction.count({ where: { AND: [where, { status: "SUCCESS" }] } }),
  ]);

  const volume = dec(agg._sum.amount ?? 0);
  const fees = dec(agg._sum.fee ?? 0);

  const rows = list.map((r) => ({
    date: r.createdAt.toISOString(),
    refId: r.refId,
    partner: r.partner ?? "—",
    service: humanize(r.service),
    customer: r.customer ?? "—",
    amount: toNumber(r.amount),
    fee: toNumber(r.fee),
    status: r.status,
  }));

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({
      table: "Transaction", dateCol: "createdAt", valueExpr: `"amount"`, userCol: "userId",
      ids, from, to, extra: Prisma.sql`AND ("partner" = 'RAZORPAY' OR "service" = 'UPI_COLLECT')`,
    }),
    "Daily collections", "#185df5"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: { date: "Total", amount: toNumber(volume), fee: toNumber(fees) },
    summary: [
      count("Collections", total, "violet"),
      money("Volume", volume, "brand"),
      money("Fees", fees, "accent"),
      percent("Success rate", total ? (successN / total) * 100 : 0, "emerald"),
    ],
    trend,
    note: total === 0
      ? "PG collections are recorded as Razorpay or UPI-collect transactions. None were found for this range."
      : null,
  };
}

/* --------------------------------------------------------------------- */
/*  4 · Payout (BulkPe disbursals)                                        */
/* --------------------------------------------------------------------- */

async function reportPayout(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const where: Prisma.PayoutRequestWhereInput = {
    ...(ids ? { userId: { in: ids } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(params.status ? { status: params.status as PayoutStatus } : {}),
    ...(params.mode ? { mode: params.mode as PayoutMode } : {}),
    ...(params.q
      ? {
          OR: [
            { beneficiaryName: { contains: params.q, mode: "insensitive" } },
            { utr: { contains: params.q, mode: "insensitive" } },
            { accountLast4: { contains: params.q } },
          ],
        }
      : {}),
  };

  const [list, total, agg] = await Promise.all([
    prisma.payoutRequest.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(params) }),
    prisma.payoutRequest.count({ where }),
    prisma.payoutRequest.aggregate({ where, _sum: { amount: true, serviceCharge: true, gst: true, totalDebit: true } }),
  ]);

  const amount = dec(agg._sum.amount ?? 0);
  const charge = dec(agg._sum.serviceCharge ?? 0);
  const gst = dec(agg._sum.gst ?? 0);
  const totalDebit = dec(agg._sum.totalDebit ?? 0);

  const rows = list.map((r) => ({
    date: r.createdAt.toISOString(),
    beneficiaryName: r.beneficiaryName,
    accountLast4: `****${r.accountLast4}`,
    mode: r.mode,
    amount: toNumber(r.amount),
    serviceCharge: toNumber(r.serviceCharge),
    gst: toNumber(r.gst),
    totalDebit: toNumber(r.totalDebit),
    status: r.status,
    utr: r.utr ?? "—",
  }));

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({ table: "PayoutRequest", dateCol: "createdAt", valueExpr: `"totalDebit"`, userCol: "userId", ids, from, to }),
    "Daily payouts", "#059669"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: {
      date: "Total",
      amount: toNumber(amount),
      serviceCharge: toNumber(charge),
      gst: toNumber(gst),
      totalDebit: toNumber(totalDebit),
    },
    summary: [
      count("Payouts", total, "violet"),
      money("Disbursed", amount, "brand"),
      money("Charges + GST", add(charge, gst), "accent"),
      money("Total debit", totalDebit, "emerald"),
    ],
    trend,
    note: total === 0 && !flags.payout
      ? "The payout service is currently disabled, and no historical payouts were found for this range."
      : null,
  };
}

/* --------------------------------------------------------------------- */
/*  5 · Credit Card (credit-card bill payments)                          */
/* --------------------------------------------------------------------- */

async function reportCreditCard(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const where: Prisma.TransactionWhereInput = {
    service: "BILL_CREDIT_CARD",
    ...(ids ? { userId: { in: ids } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(params.status ? { status: params.status as TxnStatus } : {}),
    ...(params.q
      ? {
          OR: [
            { refId: { contains: params.q, mode: "insensitive" } },
            { customer: { contains: params.q, mode: "insensitive" } },
            { operator: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [list, total, agg] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(params) }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true, fee: true, commission: true } }),
  ]);

  const volume = dec(agg._sum.amount ?? 0);
  const fees = dec(agg._sum.fee ?? 0);
  const commission = dec(agg._sum.commission ?? 0);

  const rows = list.map((r) => ({
    date: r.createdAt.toISOString(),
    refId: r.refId,
    operator: r.operator ?? "—",
    customer: r.customer ?? "—",
    amount: toNumber(r.amount),
    fee: toNumber(r.fee),
    commission: toNumber(r.commission),
    status: r.status,
  }));

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({
      table: "Transaction", dateCol: "createdAt", valueExpr: `"amount"`, userCol: "userId",
      ids, from, to, extra: Prisma.sql`AND "service" = 'BILL_CREDIT_CARD'`,
    }),
    "Daily card payments", "#7c3aed"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: { date: "Total", amount: toNumber(volume), fee: toNumber(fees), commission: toNumber(commission) },
    summary: [
      count("Payments", total, "violet"),
      money("Volume", volume, "brand"),
      money("Fees", fees, "accent"),
      money("Commission", commission, "emerald"),
    ],
    trend,
    note: total === 0
      ? "No credit-card bill payments were found for this range."
      : null,
  };
}

/* --------------------------------------------------------------------- */
/*  6 · QR Codes (no dedicated source model yet — graceful empty)         */
/* --------------------------------------------------------------------- */

async function reportQr(_user: SessionUser, params: ReportParams): Promise<ReportResult> {
  return {
    rows: [],
    total: 0,
    page: params.page,
    pageSize: params.pageSize,
    totals: {},
    summary: [
      count("QR codes", 0, "violet"),
      money("Collected", 0, "brand"),
      count("Payments", 0, "accent"),
      money("Settled", 0, "emerald"),
    ],
    trend: null,
    note:
      "QR Codes are part of a later phase and don't have a dedicated data source yet. Once QR collections are persisted, this report will populate automatically.",
  };
}

/* --------------------------------------------------------------------- */
/*  7 · POS Machines (fleet + assignment)                                 */
/* --------------------------------------------------------------------- */

async function reportPos(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const where: Prisma.PosMachineWhereInput = {
    ...(ids ? { assignedUserId: { in: ids } } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.q
      ? {
          OR: [
            { tid: { contains: params.q, mode: "insensitive" } },
            { mid: { contains: params.q, mode: "insensitive" } },
            { serial: { contains: params.q, mode: "insensitive" } },
            { location: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [list, total, active, assigned, decommissioned] = await Promise.all([
    prisma.posMachine.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { assignedUser: { select: { name: true } } },
      ...paginate(params),
    }),
    prisma.posMachine.count({ where }),
    prisma.posMachine.count({ where: { ...where, status: "active" } }),
    prisma.posMachine.count({ where: { ...where, assignedUserId: { not: null } } }),
    prisma.posMachine.count({ where: { ...where, status: "decommissioned" } }),
  ]);

  const rows = list.map((m) => ({
    tid: m.tid ?? "—",
    mid: m.mid ?? "—",
    serial: m.serial ?? "—",
    model: m.model ?? "—",
    provider: m.provider,
    status: m.status,
    assignee: m.assignedUser?.name ?? "Unassigned",
    location: [m.city, m.state].filter(Boolean).join(", ") || (m.location ?? "—"),
    assignedAt: m.assignedAt ? m.assignedAt.toISOString() : "—",
  }));

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: { tid: "Total", provider: `${total} machine${total === 1 ? "" : "s"}` },
    summary: [
      count("Total machines", total, "brand"),
      count("Active", active, "emerald"),
      count("Assigned", assigned, "violet"),
      count("Decommissioned", decommissioned, "accent"),
    ],
    trend: null,
    note: total === 0
      ? "No POS machines are assigned in your network for this view yet."
      : null,
  };
}

/* --------------------------------------------------------------------- */
/*  8 · Wallet Settlement (daily settlement of successful txns)          */
/* --------------------------------------------------------------------- */

async function reportWalletSettlement(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const { from, to } = effectiveRange(params);

  const userCond =
    ids === null || ids.length === 0
      ? Prisma.empty
      : Prisma.sql`AND "userId" IN (${Prisma.join(ids)})`;

  // SUM(numeric) stays numeric → Prisma maps it to Prisma.Decimal (exact money).
  const daily = await prisma.$queryRaw<
    { day: Date; gross: Prisma.Decimal; fee: Prisma.Decimal; gst: Prisma.Decimal; commission: Prisma.Decimal; cnt: bigint }[]
  >(Prisma.sql`
    SELECT date_trunc('day', "createdAt") AS day,
           COALESCE(SUM("amount"), 0) AS gross,
           COALESCE(SUM("fee"), 0) AS fee,
           COALESCE(SUM("gst"), 0) AS gst,
           COALESCE(SUM("commission"), 0) AS commission,
           COUNT(*) AS cnt
    FROM "Transaction"
    WHERE "status" = 'SUCCESS'
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
      ${userCond}
    GROUP BY 1
    ORDER BY 1 DESC
  `);

  const now = Date.now();
  let tGross = dec(0), tFee = dec(0), tGst = dec(0), tNet = dec(0), tTxn = 0;

  const allRows = daily.map((d) => {
    const gross = dec(d.gross);
    const fee = dec(d.fee);
    const gst = dec(d.gst);
    const net = sub(sub(gross, fee), gst);
    tGross = add(tGross, gross);
    tFee = add(tFee, fee);
    tGst = add(tGst, gst);
    tNet = add(tNet, net);
    tTxn += Number(d.cnt);
    const ageDays = Math.floor((now - new Date(d.day).getTime()) / 86_400_000);
    const status = ageDays > 1 ? "Settled" : ageDays === 1 ? "In Bank" : "Reconciling";
    return {
      date: new Date(d.day).toISOString(),
      cycle: "T+1",
      txns: Number(d.cnt),
      gross: toNumber(gross),
      fee: toNumber(fee),
      gst: toNumber(gst),
      net: toNumber(net),
      status,
    };
  });

  const total = allRows.length;
  const rows = params.forExport
    ? allRows
    : allRows.slice((params.page - 1) * params.pageSize, (params.page - 1) * params.pageSize + params.pageSize);

  const trend = trendToSeries(
    [...allRows].reverse().map((r) => ({ value: r.net })),
    "Daily net settlement", "#059669"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: {
      date: "Total",
      txns: tTxn,
      gross: toNumber(tGross),
      fee: toNumber(tFee),
      gst: toNumber(tGst),
      net: toNumber(tNet),
    },
    summary: [
      money("Gross settled", tGross, "brand"),
      money("Net settled", tNet, "emerald"),
      money("Fees + GST", add(tFee, tGst), "accent"),
      count("Settlement days", total, "violet"),
    ],
    trend,
    note: total === 0 ? "No settled transactions were found for this range." : null,
  };
}

/* --------------------------------------------------------------------- */
/*  9 · Commission (commission ledger credits)                            */
/* --------------------------------------------------------------------- */

async function reportCommission(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const where: Prisma.WalletTxnWhereInput = {
    reason: "COMMISSION",
    ...(ids ? { userId: { in: ids } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(params.q
      ? {
          OR: [
            { note: { contains: params.q, mode: "insensitive" } },
            { refId: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [list, total, agg] = await Promise.all([
    prisma.walletTxn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
      ...paginate(params),
    }),
    prisma.walletTxn.count({ where }),
    prisma.walletTxn.aggregate({ where, _sum: { amount: true } }),
  ]);

  const earned = dec(agg._sum.amount ?? 0);
  const avg = total ? dec(earned).div(total) : dec(0);

  const rows = list.map((t) => ({
    date: t.createdAt.toISOString(),
    user: t.user?.name ?? "—",
    amount: toNumber(t.amount),
    balanceAfter: toNumber(t.balanceAfter),
    refType: t.refType ?? "—",
    refId: t.refId ?? "—",
    note: t.note ?? "—",
  }));

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({
      table: "WalletTxn", dateCol: "createdAt", valueExpr: `"amount"`, userCol: "userId",
      ids, from, to, extra: Prisma.sql`AND "reason" = 'COMMISSION'`,
    }),
    "Daily commission", "#059669"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: { date: "Total", amount: toNumber(earned) },
    summary: [
      money("Commission earned", earned, "emerald"),
      count("Credits", total, "violet"),
      money("Avg / credit", avg, "brand"),
    ],
    trend,
    note: total === 0 ? "No commission was credited in this range." : null,
  };
}

/* --------------------------------------------------------------------- */
/* 10 · Account (wallet passbook from the ledger)                         */
/* --------------------------------------------------------------------- */

async function reportAccount(user: SessionUser, params: ReportParams): Promise<ReportResult> {
  const ids = await allowedUserIds(user);
  const createdAt = dateFilter(params);
  const where: Prisma.WalletTxnWhereInput = {
    ...(ids ? { userId: { in: ids } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(params.status ? { direction: params.status as WalletDirection } : {}),
    ...(params.service ? { reason: params.service as WalletReason } : {}),
    ...(params.q
      ? {
          OR: [
            { note: { contains: params.q, mode: "insensitive" } },
            { refId: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [list, total, grouped] = await Promise.all([
    prisma.walletTxn.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(params) }),
    prisma.walletTxn.count({ where }),
    prisma.walletTxn.groupBy({ by: ["direction"], where, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  let credit = dec(0), debit = dec(0), creditN = 0, debitN = 0;
  for (const g of grouped) {
    if (g.direction === "CREDIT") { credit = add(credit, g._sum.amount ?? 0); creditN = g._count._all; }
    else { debit = add(debit, g._sum.amount ?? 0); debitN = g._count._all; }
  }
  const net = sub(credit, debit);

  const rows = list.map((t) => ({
    date: t.createdAt.toISOString(),
    direction: t.direction,
    reason: t.reason,
    amount: toNumber(t.amount),
    balanceAfter: toNumber(t.balanceAfter),
    refType: t.refType ?? "—",
    refId: t.refId ?? "—",
    note: t.note ?? "—",
  }));

  const { from, to } = effectiveRange(params);
  const trend = trendToSeries(
    await dailyTrend({ table: "WalletTxn", dateCol: "createdAt", valueExpr: `"amount"`, userCol: "userId", ids, from, to }),
    "Daily movement", "#185df5"
  );

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totals: { date: "Net", amount: toNumber(net) },
    summary: [
      money("Total credits", credit, "emerald"),
      money("Total debits", debit, "accent"),
      money("Net", net, "brand"),
      count("Entries", creditN + debitN, "violet"),
    ],
    trend,
    note: total === 0 ? "No wallet activity was found for this range." : null,
  };
}

/* --------------------------------------------------------------------- */
/*  Dispatcher                                                            */
/* --------------------------------------------------------------------- */

const RUNNERS: Record<ReportType, (u: SessionUser, p: ReportParams) => Promise<ReportResult>> = {
  summary: reportSummary,
  fund: reportFund,
  pg: reportPg,
  payout: reportPayout,
  "credit-card": reportCreditCard,
  qr: reportQr,
  pos: reportPos,
  "wallet-settlement": reportWalletSettlement,
  commission: reportCommission,
  account: reportAccount,
};

export function runReport(type: ReportType, user: SessionUser, params: ReportParams): Promise<ReportResult> {
  return RUNNERS[type](user, params);
}
