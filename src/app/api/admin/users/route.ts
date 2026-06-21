import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 50)));

    const where: Record<string, unknown> = {};

    if (role && role !== "all") {
      const roleMap: Record<string, string> = {
        retailer: "RETAILER",
        distributor: "DISTRIBUTOR",
        "master-distributor": "MASTER_DISTRIBUTOR",
      };
      if (roleMap[role]) where.role = roleMap[role];
    }

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
        { email: { contains: q, mode: "insensitive" } },
        { shopName: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
      ];
    }

    // Exclude ADMIN and SUPPORT from the user list
    where.role = where.role ?? { notIn: ["ADMIN", "SUPPORT"] };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: where as any,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where: where as any }),
    ]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyTurnovers = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        userId: { in: users.map((u) => u.id) },
        status: "SUCCESS",
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    });

    const turnoverMap = new Map(
      monthlyTurnovers.map((t) => [t.userId, Number(t._sum.amount ?? 0)])
    );

    const displayRole = (r: string) => {
      const map: Record<string, string> = {
        RETAILER: "retailer",
        DISTRIBUTOR: "distributor",
        MASTER_DISTRIBUTOR: "master-distributor",
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

    const mapped = users.map((u) => ({
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

    return NextResponse.json({ users: mapped, total, page, pageSize });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/users] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
