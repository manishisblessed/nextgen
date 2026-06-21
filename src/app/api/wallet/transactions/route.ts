import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20))
  );

  const [txns, total] = await Promise.all([
    prisma.walletTxn.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.walletTxn.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    txns: txns.map((t) => ({
      id: t.id,
      direction: t.direction,
      reason: t.reason,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      note: t.note,
      refType: t.refType,
      refId: t.refId,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
}
