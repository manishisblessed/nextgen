import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();

    // Only admin roles can view user data
    if (!["MASTER_ADMIN", "ADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Only admins can view user data" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      parentId: user.id,
    };

    if (status && status !== "all") {
      const statusMap: Record<string, string> = {
        Active: "ACTIVE",
        "Pending KYC": "PENDING_KYC",
        Suspended: "SUSPENDED",
      };
      if (statusMap[status]) where.status = statusMap[status];
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { shopName: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
      ];
    }

    const children = await prisma.user.findMany({
      where: where as any,
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        shopName: true,
        city: true,
        state: true,
        walletBalance: true,
        createdAt: true,
        _count: { select: { children: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const turnovers = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        userId: { in: children.map((c) => c.id) },
        status: "SUCCESS",
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    });

    const turnoverMap = new Map(
      turnovers.map((t) => [t.userId, Number(t._sum.amount ?? 0)])
    );

    const displayRole = (r: string) => {
      const map: Record<string, string> = {
        RETAILER: "retailer",
        DISTRIBUTOR: "distributor",
        MASTER_DISTRIBUTOR: "master-distributor",
        SUPER_DISTRIBUTOR: "super-distributor",
      };
      return map[r] ?? r.toLowerCase();
    };

    const displayStatus = (s: string) => {
      const map: Record<string, string> = {
        ACTIVE: "Active",
        PENDING_KYC: "Pending KYC",
        SUSPENDED: "Suspended",
        CLOSED: "Closed",
      };
      return map[s] ?? s;
    };

    const mapped = children.map((u) => ({
      id: u.id,
      name: u.name,
      shop: u.shopName ?? "—",
      role: displayRole(u.role),
      city: u.city ?? "—",
      state: u.state ?? "—",
      joined: u.createdAt.toLocaleDateString("en-IN", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      status: displayStatus(u.status),
      walletBalance: Number(u.walletBalance),
      monthlyTurnover: turnoverMap.get(u.id) ?? 0,
      retailers: u._count.children,
    }));

    return NextResponse.json({ users: mapped });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[network] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
