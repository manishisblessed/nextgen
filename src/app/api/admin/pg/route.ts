import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { getPgReport } from "@/lib/admin/pgReport";
import { getTopupsByUser, type PayinPeriod } from "@/lib/wallet/payin";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PERIODS: PayinPeriod[] = ["today", "week", "month", "year"];
function parsePeriod(v: string | null): PayinPeriod {
  return v && (PERIODS as string[]).includes(v) ? (v as PayinPeriod) : "month";
}

/**
 * GET /api/admin/pg?period=today|week|month|year — the live Payment Gateway
 * dashboard: headline stats (GMV, MDR revenue, success rate), the recent PG
 * settlement feed, a per-retailer rollup, and the dedicated wallet top-ups view
 * (genuine TOPUP… transactions by user). All read-only.
 */
export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const period = parsePeriod(new URL(req.url).searchParams.get("period"));
  const [report, topups] = await Promise.all([getPgReport(period), getTopupsByUser(period)]);

  return NextResponse.json({ ...report, topups });
}
