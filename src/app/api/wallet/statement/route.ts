import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { dec, add, toNumber } from "@/lib/money";
import {
  buildStatementCsv,
  generateWalletStatementPdf,
  REASON_LABELS,
  type StatementData,
} from "@/lib/statements/walletStatement";

/**
 * GET /api/wallet/statement?from=YYYY-MM-DD&to=YYYY-MM-DD&format=pdf|csv
 *
 * Downloadable wallet statement for the authenticated user. Opening balance
 * is derived from the last ledger row before the period (balanceAfter), so
 * the statement always reconciles with the WalletTxn ledger.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const MAX_ROWS = 3000;

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`wallet:statement:${user.id}`, RATE_LIMITS.reportQuery);
  } catch (e) {
    return toErrorResponse(e);
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = url.searchParams.get("from") ? new Date(`${url.searchParams.get("from")}T00:00:00+05:30`) : defaultFrom;
  const to = url.searchParams.get("to") ? new Date(`${url.searchParams.get("to")}T23:59:59.999+05:30`) : now;
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  // Statements are for review, not bulk export — cap the window at 1 year.
  if (to.getTime() - from.getTime() > 366 * 24 * 3600_000) {
    return NextResponse.json({ error: "Date range too large (max 1 year)" }, { status: 400 });
  }

  const [txns, prior, me] = await Promise.all([
    prisma.walletTxn.findMany({
      where: { userId: user.id, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
    }),
    prisma.walletTxn.findFirst({
      where: { userId: user.id, createdAt: { lt: from } },
      orderBy: { createdAt: "desc" },
      select: { balanceAfter: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, phone: true, role: true },
    }),
  ]);

  let credits = dec(0);
  let debits = dec(0);
  for (const t of txns) {
    if (t.direction === "CREDIT") credits = add(credits, t.amount);
    else debits = add(debits, t.amount);
  }

  const openingBalance = toNumber(dec(prior?.balanceAfter ?? 0));
  const closingBalance =
    txns.length > 0 ? toNumber(dec(txns[txns.length - 1].balanceAfter)) : openingBalance;

  const data: StatementData = {
    accountName: me?.name ?? "—",
    accountPhone: me?.phone ?? "—",
    role: me?.role ?? "",
    from,
    to,
    openingBalance,
    closingBalance,
    totalCredits: toNumber(credits),
    totalDebits: toNumber(debits),
    rows: txns.map((t) => ({
      date: t.createdAt,
      description: (REASON_LABELS[t.reason] ?? t.reason) + (t.note ? ` — ${t.note}` : ""),
      ref: t.refId,
      debit: t.direction === "DEBIT" ? toNumber(dec(t.amount)) : null,
      credit: t.direction === "CREDIT" ? toNumber(dec(t.amount)) : null,
      balanceAfter: toNumber(dec(t.balanceAfter)),
    })),
  };

  const stamp = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;

  if (format === "csv") {
    return new NextResponse(buildStatementCsv(data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wallet-statement-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = await generateWalletStatementPdf(data);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="wallet-statement-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
