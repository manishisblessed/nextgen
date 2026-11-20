import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { scopeDirectUserIdFilter } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export interface PosVolumeSummaryResponse {
  dailyTotal: number;
  dailyCount: number;
  monthlyTotal: number;
  monthlyCount: number;
  machineCount: number;
}

/** Returns {gte, lt} for the current IST calendar day. */
function currentIstDayRange(): { gte: Date; lt: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth();
  const d = nowIST.getUTCDate();
  const dayStart = new Date(Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MS);
  const dayEnd = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - IST_OFFSET_MS);
  return { gte: dayStart, lt: dayEnd };
}

/** Returns {gte, lt} for the current IST calendar month. */
function currentIstMonthRange(): { gte: Date; lt: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0) - IST_OFFSET_MS);
  const monthEnd = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0) - IST_OFFSET_MS);
  return { gte: monthStart, lt: monthEnd };
}

/**
 * GET /api/pos/volume-summary
 *
 * Returns aggregated CAPTURED transaction volume for the caller's POS machines:
 *   - dailyTotal / dailyCount  — current IST calendar day
 *   - monthlyTotal / monthlyCount — current IST calendar month
 *   - machineCount — number of assigned machines
 *
 * Used by the RetailerOverview dashboard to show POS daily vs monthly stats.
 */
export async function GET(_req: Request) {
  let user;
  try {
    user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.POS, { name: "POS Terminals", userId: user.id, role: user.role });
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceDisabledError)
      return NextResponse.json({ error: (e as Error).message }, { status: (e as AuthError).statusCode });
    throw e;
  }

  const empty: PosVolumeSummaryResponse = {
    dailyTotal: 0,
    dailyCount: 0,
    monthlyTotal: 0,
    monthlyCount: 0,
    machineCount: 0,
  };

  if (!flags.pos) return NextResponse.json<PosVolumeSummaryResponse>(empty);

  const scope = await scopeDirectUserIdFilter(user);
  const where = scope.userId
    ? { assignedUserId: scope.userId }
    : { assignedUserId: { not: null } as const };

  const machines = await prisma.posMachine.findMany({
    where,
    select: { id: true, tid: true },
  });

  const machineCount = machines.length;
  if (machineCount === 0) return NextResponse.json<PosVolumeSummaryResponse>({ ...empty, machineCount: 0 });

  const tids = machines.map((m) => m.tid).filter((t): t is string => Boolean(t));
  if (tids.length === 0) return NextResponse.json<PosVolumeSummaryResponse>({ ...empty, machineCount });

  const { gte: dayStart, lt: dayEnd } = currentIstDayRange();
  const { gte: monthStart, lt: monthEnd } = currentIstMonthRange();

  const baseWhere = { terminalId: { in: tids }, status: "CAPTURED" as const };

  const [dailyAgg, monthlyAgg] = await Promise.all([
    prisma.posTransactionMirror.aggregate({
      where: { ...baseWhere, txnTime: { gte: dayStart, lt: dayEnd } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.posTransactionMirror.aggregate({
      where: { ...baseWhere, txnTime: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  return NextResponse.json<PosVolumeSummaryResponse>({
    dailyTotal: dailyAgg._sum.amount != null ? Number(dailyAgg._sum.amount) : 0,
    dailyCount: dailyAgg._count.id ?? 0,
    monthlyTotal: monthlyAgg._sum.amount != null ? Number(monthlyAgg._sum.amount) : 0,
    monthlyCount: monthlyAgg._count.id ?? 0,
    machineCount,
  });
}
