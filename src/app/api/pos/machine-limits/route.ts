import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { scopeDirectUserIdFilter } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import type { PosMachineLimitStatus, PosMachineLimitsResponse } from "@/lib/partners/sameday-pos.types";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** Platform-wide default monthly cap (₹6,50,000) per POS machine. */
const POS_PLATFORM_DEFAULT_LIMIT = 650_000;

/** Returns {gte, lt} covering the current IST calendar month. */
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
 * GET /api/pos/machine-limits
 *
 * Returns limit-status records for the caller's POS machines that are either:
 *   • exceeded  (monthlyTotal > effectiveLimit), or
 *   • warning   (80–100 % of effectiveLimit)
 *
 * Used by the RetailerOverview dashboard widget to surface a prominent alert
 * without a full my-machines load.
 */
export async function GET(_req: Request) {
  let user;
  try {
    user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.POS, { name: "POS Terminals", userId: user.id, role: user.role });
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceDisabledError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json<PosMachineLimitsResponse>({
      exceeded: [],
      warning: [],
      platformDefault: POS_PLATFORM_DEFAULT_LIMIT,
    });

  // Scope to this user's machines (same as my-machines — direct children only).
  const scope = await scopeDirectUserIdFilter(user);
  const where = scope.userId
    ? { assignedUserId: scope.userId }
    : { assignedUserId: { not: null } as const };

  // Fetch machines with just the columns we need.
  const machines = await prisma.posMachine.findMany({
    where,
    select: {
      id: true,
      tid: true,
      serial: true,
      model: true,
      transactionLimit: true,
    },
  });

  if (machines.length === 0)
    return NextResponse.json<PosMachineLimitsResponse>({
      exceeded: [],
      warning: [],
      platformDefault: POS_PLATFORM_DEFAULT_LIMIT,
    });

  // Per-user limit override.
  const userLimitRow = await prisma.userLimit.findUnique({
    where: { userId: user.id },
    select: { posMachineTransactionLimit: true },
  });
  const userPosLimit =
    userLimitRow?.posMachineTransactionLimit != null
      ? Number(userLimitRow.posMachineTransactionLimit)
      : null;

  // Aggregate monthly CAPTURED totals from the mirror.
  const tids = machines.map((m) => m.tid).filter((t): t is string => Boolean(t));
  const { gte: monthStart, lt: monthEnd } = currentIstMonthRange();

  const monthlyAgg =
    tids.length > 0
      ? await prisma.posTransactionMirror.groupBy({
          by: ["terminalId"],
          where: {
            terminalId: { in: tids },
            status: "CAPTURED",
            txnTime: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amount: true },
        })
      : [];

  const monthlyByTid = new Map<string, number>(
    monthlyAgg.map((g) => [
      g.terminalId,
      g._sum.amount != null ? Number(g._sum.amount) : 0,
    ])
  );

  const exceeded: PosMachineLimitStatus[] = [];
  const warning: PosMachineLimitStatus[] = [];

  for (const m of machines) {
    const machineLimit =
      m.transactionLimit != null ? Number(m.transactionLimit) : null;
    const effectiveLimit = machineLimit ?? userPosLimit ?? POS_PLATFORM_DEFAULT_LIMIT;
    const monthlyTotal = m.tid ? (monthlyByTid.get(m.tid) ?? 0) : 0;
    const rawPct = effectiveLimit > 0 ? (monthlyTotal / effectiveLimit) * 100 : 0;
    const limitUsedPct = Math.round(Math.min(rawPct, 999));
    const limitExceeded = monthlyTotal > effectiveLimit;

    const record: PosMachineLimitStatus = {
      machineId: m.id,
      tid: m.tid,
      serial: m.serial,
      model: m.model,
      effectiveLimit,
      monthlyTotal,
      limitUsedPct,
      limitExceeded,
    };

    if (limitExceeded) {
      exceeded.push(record);
    } else if (limitUsedPct >= 80) {
      warning.push(record);
    }
  }

  return NextResponse.json<PosMachineLimitsResponse>({
    exceeded,
    warning,
    platformDefault: POS_PLATFORM_DEFAULT_LIMIT,
  });
}
