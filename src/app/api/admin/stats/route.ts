import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { partnerStatus } from "@/lib/partners";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      userCounts,
      pendingKyc,
      todayTxns,
      monthlyGmv,
      recentAudit,
      partners,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["status"],
        _count: true,
        where: { role: { notIn: ["ADMIN", "SUPPORT"] } },
      }),
      prisma.kyc.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.transaction.aggregate({
        where: { status: "SUCCESS", createdAt: { gte: todayStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { status: "SUCCESS", createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.auditLog.findMany({
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      Promise.resolve(partnerStatus()),
    ]);

    const activeUsers =
      userCounts.find((c) => c.status === "ACTIVE")?._count ?? 0;
    const totalUsers = userCounts.reduce((sum, c) => sum + c._count, 0);

    // Daily GMV for last 14 days (for sparkline)
    const dailyGmv: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const agg = await prisma.transaction.aggregate({
        where: { status: "SUCCESS", createdAt: { gte: dayStart, lte: dayEnd } },
        _sum: { amount: true },
      });
      dailyGmv.push(Number(agg._sum.amount ?? 0));
    }

    // Service health from partner status
    const serviceHealth = Object.entries(partners).map(([key, val]) => ({
      service: key.toUpperCase(),
      live: val.live,
      provider: val.provider,
    }));

    const severityMap = (action: string) => {
      if (["user.suspend", "user.close", "kyc.reject"].includes(action)) return "danger";
      if (["commission.update", "commission.deactivate", "fund_request.reject"].includes(action)) return "warn";
      return "info";
    };

    const auditEvents = recentAudit.map((l) => ({
      id: l.id,
      actor: l.user?.email ?? "system",
      action: l.action,
      target: [l.entity, l.entityId].filter(Boolean).join(" · ") || "—",
      severity: severityMap(l.action),
      ts: l.createdAt.toLocaleString("en-IN", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    }));

    return NextResponse.json({
      activeUsers,
      totalUsers,
      pendingKyc,
      settledToday: Number(todayTxns._sum.amount ?? 0),
      txnsToday: todayTxns._count,
      monthlyGmv: Number(monthlyGmv._sum.amount ?? 0),
      dailyGmv,
      serviceHealth,
      auditEvents,
    });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/stats] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
