import { NextResponse } from "next/server";
import type { ServiceCode } from "@prisma/client";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { dec, toNumber } from "@/lib/money";
import { istDayBounds } from "@/lib/reports/daily";
import { BILL_SERVICE_CODES } from "@/lib/reports/registry";
import { getRevenueReport } from "@/lib/reports/revenue";
import { BUSINESS_OVERVIEW_TAB } from "@/lib/roles";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * Master-admin "Today's Business Overview" — platform-wide business done today
 * across the five headline rails (QR / POS / BBPS / PG / Payout), plus a compact
 * settlement / pending / revenue / growth summary.
 *
 * Additive, read-only aggregation. Each rail is read from its OWN source of
 * truth so the combined total never double-counts:
 *   QR     → QrClaim               (amount)
 *   POS    → PosSettlementEntry    (grossAmount)
 *   PG     → PgSettlementEntry     (grossAmount)
 *   BBPS   → Transaction (BILL_*)  (amount)
 *   Payout → PayoutRequest         (amount)
 * "Today" is the current IST business day (istDayBounds), matching the app's
 * existing reporting convention. Statuses use each model's real status values,
 * mapped to user-friendly Success / Pending / Failed buckets.
 *
 * Access: master-admin always; ADMIN / SUPPORT (sub-admin) only when granted the
 * "business-overview" tab (User.allowedTabs) — the same permission mechanism the
 * rest of the admin workspace uses.
 */

function canView(user: { role: string; allowedTabs?: string[] | null }): boolean {
  if (user.role === "MASTER_ADMIN") return true;
  if (user.role === "ADMIN" || user.role === "SUPPORT") {
    return (user.allowedTabs ?? []).includes(BUSINESS_OVERVIEW_TAB);
  }
  return false;
}

type ServiceToday = {
  amount: number;
  count: number;
  success: number;
  pending: number;
  failed: number;
};

type Bucket = "success" | "pending" | "failed";

type Window = { dayStart: Date; dayEnd: Date };

/** Normalize a Prisma groupBy-by-status result into flat rows. */
function normalize(
  rows: Array<{ status: string; _count: number; _sum: Record<string, unknown> }>,
  amountField: string
): Array<{ status: string; count: number; amount: number }> {
  return rows.map((r) => ({
    status: String(r.status),
    count: typeof r._count === "number" ? r._count : 0,
    amount: toNumber(dec((r._sum?.[amountField] as never) ?? 0)),
  }));
}

/** Fold status-grouped rows into a single card summary. */
function summarize(
  rows: Array<{ status: string; count: number; amount: number }>,
  classify: (status: string) => Bucket
): ServiceToday {
  const out: ServiceToday = { amount: 0, count: 0, success: 0, pending: 0, failed: 0 };
  for (const r of rows) {
    out.amount += r.amount;
    out.count += r.count;
    out[classify(r.status)] += r.count;
  }
  out.amount = Math.round(out.amount * 100) / 100;
  return out;
}

const classifyQr = (s: string): Bucket =>
  s === "SETTLED" || s === "APPROVED"
    ? "success"
    : s === "REJECTED" || s === "CLAWED_BACK"
    ? "failed"
    : "pending";

const classifyPos = (s: string): Bucket =>
  s === "SETTLED" ? "success" : s === "FAILED" || s === "REVERSED" ? "failed" : "pending";

const classifyPg = (s: string): Bucket =>
  s === "SETTLED" ? "success" : s === "FAILED" ? "failed" : "pending";

const classifyTxn = (s: string): Bucket =>
  s === "SUCCESS" ? "success" : s === "FAILED" || s === "REFUNDED" ? "failed" : "pending";

const classifyPayout = (s: string): Bucket =>
  s === "SUCCESS"
    ? "success"
    : s === "FAILED" || s === "REJECTED" || s === "REVERSED"
    ? "failed"
    : "pending";

function addServiceTotals(parts: ServiceToday[]): ServiceToday {
  const total: ServiceToday = { amount: 0, count: 0, success: 0, pending: 0, failed: 0 };
  for (const p of parts) {
    total.amount += p.amount;
    total.count += p.count;
    total.success += p.success;
    total.pending += p.pending;
    total.failed += p.failed;
  }
  total.amount = Math.round(total.amount * 100) / 100;
  return total;
}

/** Per-rail business done within a window (records created in the window). */
async function aggregateServices(w: Window) {
  const range = { gte: w.dayStart, lte: w.dayEnd };

  const [qrRows, posRows, pgRows, bbpsRows, payoutRows] = await Promise.all([
    prisma.qrClaim.groupBy({
      by: ["status"],
      where: { createdAt: range },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.posSettlementEntry.groupBy({
      by: ["status"],
      where: { createdAt: range },
      _count: true,
      _sum: { grossAmount: true },
    }),
    prisma.pgSettlementEntry.groupBy({
      by: ["status"],
      where: { createdAt: range },
      _count: true,
      _sum: { grossAmount: true },
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      where: {
        service: { in: BILL_SERVICE_CODES as unknown as ServiceCode[] },
        createdAt: range,
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.payoutRequest.groupBy({
      by: ["status"],
      where: { createdAt: range },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const qr = summarize(normalize(qrRows as never, "amount"), classifyQr);
  const pos = summarize(normalize(posRows as never, "grossAmount"), classifyPos);
  const pg = summarize(normalize(pgRows as never, "grossAmount"), classifyPg);
  const bbps = summarize(normalize(bbpsRows as never, "amount"), classifyTxn);
  const payout = summarize(normalize(payoutRows as never, "amount"), classifyPayout);
  const total = addServiceTotals([qr, pos, bbps, pg, payout]);

  return { qr, pos, bbps, pg, payout, total };
}

/** Net actually settled into wallets today (settledAt in window) across rails. */
async function aggregateSettlementToday(w: Window): Promise<number> {
  const range = { gte: w.dayStart, lte: w.dayEnd };
  const [pos, pg, qr] = await Promise.all([
    prisma.posSettlementEntry.aggregate({
      where: { status: "SETTLED", settledAt: range },
      _sum: { netAmount: true },
    }),
    prisma.pgSettlementEntry.aggregate({
      where: { status: "SETTLED", settledAt: range },
      _sum: { netAmount: true },
    }),
    prisma.qrClaim.aggregate({
      where: { status: "SETTLED", settledAt: range },
      _sum: { netAmount: true },
    }),
  ]);
  return (
    toNumber(dec(pos._sum.netAmount ?? 0)) +
    toNumber(dec(pg._sum.netAmount ?? 0)) +
    toNumber(dec(qr._sum.netAmount ?? 0))
  );
}

/** Business awaiting settlement right now (not time-boxed to today). */
async function aggregatePending(): Promise<number> {
  const [pos, pg, qr] = await Promise.all([
    prisma.posSettlementEntry.aggregate({
      where: { status: "PENDING" },
      _sum: { netAmount: true },
    }),
    prisma.pgSettlementEntry.aggregate({
      where: { status: "PENDING" },
      _sum: { netAmount: true },
    }),
    prisma.qrClaim.aggregate({
      where: { status: "SETTLEABLE" },
      _sum: { amount: true },
    }),
  ]);
  return (
    toNumber(dec(pos._sum.netAmount ?? 0)) +
    toNumber(dec(pg._sum.netAmount ?? 0)) +
    toNumber(dec(qr._sum.amount ?? 0))
  );
}

type GrowthState = "new" | "flat" | "up" | "down";

function computeGrowth(today: number, yesterday: number): { pct: number | null; state: GrowthState } {
  if (yesterday <= 0) {
    return today > 0 ? { pct: null, state: "new" } : { pct: 0, state: "flat" };
  }
  const raw = ((today - yesterday) / yesterday) * 100;
  const pct = Math.round(raw * 10) / 10;
  return { pct, state: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!canView(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const today = istDayBounds();
    const yesterday = istDayBounds(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const [todayAgg, yAgg, settlementToday, pendingAmount, commissionRevenue] = await Promise.all([
      aggregateServices(today),
      aggregateServices(yesterday),
      aggregateSettlementToday(today),
      aggregatePending(),
      getRevenueReport({ from: today.ymd, to: today.ymd })
        .then((r) => r.totals.platformRevenue)
        .catch(() => 0),
    ]);

    const growth = computeGrowth(todayAgg.total.amount, yAgg.total.amount);

    return NextResponse.json({
      date: today.ymd,
      total: todayAgg.total,
      qr: todayAgg.qr,
      pos: todayAgg.pos,
      bbps: todayAgg.bbps,
      pg: todayAgg.pg,
      payout: todayAgg.payout,
      summary: {
        settlementToday: Math.round(settlementToday * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        commissionRevenue: Math.round(commissionRevenue * 100) / 100,
        yesterdayTotal: yAgg.total.amount,
        growthPct: growth.pct,
        growthState: growth.state,
      },
    });
  } catch (e) {
    console.error("[dashboard/business-overview] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
