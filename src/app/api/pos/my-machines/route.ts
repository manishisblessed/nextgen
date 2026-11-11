import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { scopeDirectUserIdFilter, canAccessUser, getDescendantIds } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { posMachineSelect, serializePosMachine } from "@/lib/pos/assignments";
import type { Prisma } from "@prisma/client";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

/** Platform-wide monthly transaction cap per machine (₹6,50,000). */
const POS_PLATFORM_DEFAULT_LIMIT = 650_000;

/**
 * Returns the start and end of the current IST calendar month as UTC Date objects.
 * Used to scope the monthly-total aggregation from PosTransactionMirror.
 */
function currentIstMonthRange(): { gte: Date; lt: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth(); // 0-based
  const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0) - IST_OFFSET_MS);
  const monthEnd = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0) - IST_OFFSET_MS);
  return { gte: monthStart, lt: monthEnd };
}

/**
 * GET /api/pos/my-machines
 *
 * User-facing list of POS machines assigned to the caller (and, for parents,
 * their DIRECT children only — SD→MDs, MD→DTs, DT→RTs). Scoped via
 * `scopeDirectUserIdFilter` so a user only ever sees their own and their
 * immediate children's terminals. Admins see the whole assigned fleet.
 *
 * Each machine includes computed monthly-limit fields:
 *   effectiveLimit, monthlyTotal, limitUsedPct, limitExceeded
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    // Admin kill-switch + per-user allowlist (default-disabled) for this rail.
    await assertServiceEnabled(SERVICE_KEYS.POS, { name: "POS Terminals", userId: user.id, role: user.role });
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceDisabledError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json(
      { error: "POS service is not enabled" },
      { status: 503 }
    );

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize") ?? 50)));

  // Optional `forChild` scoping: the POS Rental page uses this to list machines
  // it may rent to a specific downline member. A machine can be rented to a
  // child even after it has flowed further down the chain (MD → DT → RT), so
  // we scope to the child's whole subtree (child + descendants), not just
  // machines the child holds directly.
  const forChild = searchParams.get("forChild");
  let where: Prisma.PosMachineWhereInput;
  if (forChild) {
    if (!(await canAccessUser(forChild, user)))
      return NextResponse.json({ error: "User not in your network" }, { status: 403 });
    const subtreeIds = [forChild, ...(await getDescendantIds(forChild))];
    where = { assignedUserId: { in: subtreeIds } };
  } else {
    // scopeDirectUserIdFilter returns { userId: { in: [self + direct children] } }
    // for non-admins, {} for admins. The machine's owner column is
    // `assignedUserId`, so remap it.
    const scope = await scopeDirectUserIdFilter(user);
    where = scope.userId
      ? { assignedUserId: scope.userId }
      : { assignedUserId: { not: null } };
  }

  const [rows, total] = await Promise.all([
    prisma.posMachine.findMany({
      where,
      select: posMachineSelect,
      orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.posMachine.count({ where }),
  ]);

  const active = await prisma.posMachine.count({
    where: { ...where, status: "active" },
  });

  // ── Limit enrichment ─────────────────────────────────────────────────────
  // 1. Fetch current user's per-user POS machine limit override.
  const userLimitRow = await prisma.userLimit.findUnique({
    where: { userId: user.id },
    select: { posMachineTransactionLimit: true },
  });
  const userPosLimit =
    userLimitRow?.posMachineTransactionLimit != null
      ? Number(userLimitRow.posMachineTransactionLimit)
      : null;

  // 2. Aggregate current IST-month CAPTURED transaction totals per TID.
  const tids = rows.map((r) => r.tid).filter((t): t is string => Boolean(t));
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

  // 3. Enrich each machine row with limit + usage fields.
  const enrichedData = rows.map((m) => {
    const base = serializePosMachine(m);
    const machineLimit = base.transactionLimit; // already a number | null
    const effectiveLimit = machineLimit ?? userPosLimit ?? POS_PLATFORM_DEFAULT_LIMIT;
    const monthlyTotal = m.tid ? (monthlyByTid.get(m.tid) ?? 0) : 0;
    const rawPct = effectiveLimit > 0 ? (monthlyTotal / effectiveLimit) * 100 : 0;
    const limitUsedPct = Math.round(Math.min(rawPct, 999));
    const limitExceeded = monthlyTotal > effectiveLimit;

    return {
      ...base,
      effectiveLimit,
      monthlyTotal,
      limitUsedPct,
      limitExceeded,
    };
  });

  const exceededCount = enrichedData.filter((m) => m.limitExceeded).length;
  const warningCount = enrichedData.filter(
    (m) => !m.limitExceeded && (m.limitUsedPct ?? 0) >= 80
  ).length;

  return NextResponse.json({
    data: enrichedData,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasPrev: page > 1,
      hasNext: page * pageSize < total,
    },
    stats: { total, active, exceededCount, warningCount },
  });
}
