import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { partnerStatus } from "@/lib/partners";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");

    const billers = await prisma.biller.groupBy({
      by: ["category"],
      _count: { id: true },
      where: { active: true },
    });

    const allBillers = await prisma.biller.findMany({
      select: { category: true, active: true, partner: true },
    });

    const partners = partnerStatus();

    const categoryStats = billers.map((b) => {
      const categoryBillers = allBillers.filter(
        (ab) => ab.category === b.category
      );
      const activeBillers = categoryBillers.filter((ab) => ab.active);
      const primaryPartner =
        categoryBillers[0]?.partner ?? "BBPS";

      const isLive = partners.bbps.live;

      return {
        category: b.category,
        count: b._count.id,
        routing: `${primaryPartner} · NPCI`,
        uptime: isLive ? "99.9%" : "—",
        status: isLive
          ? activeBillers.length === b._count.id
            ? ("Live" as const)
            : ("Degraded" as const)
          : ("Down" as const),
      };
    });

    const totalActive = allBillers.filter((b) => b.active).length;
    const totalCategories = new Set(allBillers.map((b) => b.category)).size;
    const degradedCount = categoryStats.filter(
      (c) => c.status === "Degraded"
    ).length;
    const downCount = categoryStats.filter((c) => c.status === "Down").length;

    return NextResponse.json({
      billers: categoryStats,
      stats: {
        totalActive,
        totalCategories,
        degradedCount,
        downCount,
      },
    });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/billers] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
