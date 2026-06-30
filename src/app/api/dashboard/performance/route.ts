import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      shopName: true,
      shopAddress: true,
      pincode: true,
      state: true,
      city: true,
      walletBalance: true,
      lastLoginLat: true,
      lastLoginLng: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      createdAt: true,
      parentId: true,
      _count: {
        select: {
          transactions: true,
          wallet: true,
          children: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get recent login activity from audit logs
  const loginHistory = await prisma.auditLog.findMany({
    where: {
      userId: session.id,
      action: "user.login",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      meta: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });

  // Get transaction stats for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTxns = await prisma.transaction.findMany({
    where: {
      userId: session.id,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      amount: true,
      status: true,
      createdAt: true,
    },
  });

  const totalAmount = recentTxns.reduce((sum, t) => sum + Number(t.amount), 0);
  const successfulTxns = recentTxns.filter((t) => t.status === "SUCCESS").length;
  const failedTxns = recentTxns.filter((t) => t.status === "FAILED").length;

  // Get parent info if applicable
  let parentInfo = null;
  if (user.parentId) {
    parentInfo = await prisma.user.findUnique({
      where: { id: user.parentId },
      select: { name: true, email: true, phone: true, role: true },
    });
  }

  return NextResponse.json({
    user: {
      ...user,
      walletBalance: Number(user.walletBalance),
    },
    parentInfo,
    loginHistory,
    stats: {
      totalTransactions30d: recentTxns.length,
      totalAmount30d: totalAmount,
      successfulTxns,
      failedTxns,
      successRate: recentTxns.length > 0
        ? Math.round((successfulTxns / recentTxns.length) * 100)
        : 0,
      networkSize: user._count.children,
      walletTransactions: user._count.wallet,
    },
  });
}
