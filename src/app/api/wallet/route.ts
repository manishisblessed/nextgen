import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { buildPayoutLedgerMemos } from "@/lib/payout/ledgerMemos";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 20;

type RecentTxn = {
  id: string;
  direction: "CREDIT" | "DEBIT";
  reason: string;
  amount: number;
  balanceAfter: number | null;
  note: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  memo: boolean;
};

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { walletBalance: true },
  });

  // Light mode for the topbar poller — skips the txn/aggregate queries.
  const { searchParams } = new URL(req.url);
  if (searchParams.get("balanceOnly") === "1") {
    return NextResponse.json({ balance: Number(dbUser.walletBalance) });
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Opt-in: clients that can render payout reservation memos (e.g. the mobile app)
  // request them; every other consumer gets the real activity unchanged.
  const includeMemos = searchParams.get("memos") === "1";

  const [monthlyAgg, recent, memos] = await Promise.all([
    prisma.walletTxn.groupBy({
      by: ["direction"],
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.walletTxn.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
    }),
    includeMemos ? buildPayoutLedgerMemos(user.id, {}) : Promise.resolve([]),
  ]);

  const monthlyIn = Number(
    monthlyAgg.find((a) => a.direction === "CREDIT")?._sum.amount ?? 0
  );
  const monthlyOut = Number(
    monthlyAgg.find((a) => a.direction === "DEBIT")?._sum.amount ?? 0
  );

  const realTxns: RecentTxn[] = recent.map((t) => ({
    id: t.id,
    direction: t.direction,
    reason: t.reason,
    amount: Number(t.amount),
    balanceAfter: Number(t.balanceAfter),
    note: t.note,
    refType: t.refType,
    refId: t.refId,
    createdAt: t.createdAt.toISOString(),
    memo: false,
  }));

  let recentTxns: RecentTxn[] = realTxns;
  if (includeMemos && memos.length > 0) {
    const memoTxns: RecentTxn[] = memos.map((m) => ({
      id: m.id,
      direction: m.direction,
      reason: m.reason,
      amount: m.amount,
      balanceAfter: null,
      note: m.note,
      refType: m.refType,
      refId: m.refId,
      createdAt: m.createdAt,
      memo: true,
    }));
    recentTxns = [...realTxns, ...memoTxns]
      .sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1
      )
      .slice(0, RECENT_LIMIT);
  }

  return NextResponse.json({
    balance: Number(dbUser.walletBalance),
    monthlyIn,
    monthlyOut,
    recentTxns,
  });
}
