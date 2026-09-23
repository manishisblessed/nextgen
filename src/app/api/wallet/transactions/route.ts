import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { buildPayoutLedgerMemos } from "@/lib/payout/ledgerMemos";
import { bankLogoSlug } from "@/lib/bank-logos";
import { resolveTxnBankName } from "@/lib/txn/bankName";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** Unified shape for a real WalletTxn or a synthetic payout reservation memo. */
type LedgerRow = {
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
  /** Resolved bank/issuer name for logo display; only set on card/bill rows. */
  logo?: string | null;
};

/**
 * Attach a bank/issuer name (for logo rendering) to the ledger rows that point
 * at a service Transaction — so card & bill payments show the real bank logo in
 * the wallet ledger. Resolves CC-1 biller *codes* to names via the biller table;
 * CC-2 already stores the bank name as the operator. Only rows that map to a
 * known bank logo get a `logo` value (others render no icon).
 */
async function attachBankLogos(rows: LedgerRow[]): Promise<LedgerRow[]> {
  const txnIds = [
    ...new Set(
      rows
        .filter((r) => r.refType === "Transaction" && r.refId)
        .map((r) => r.refId as string)
    ),
  ];
  if (txnIds.length === 0) return rows;

  const txns = await prisma.transaction.findMany({
    where: { id: { in: txnIds } },
    select: { id: true, operator: true, request: true },
  });
  const txnById = new Map(txns.map((t) => [t.id, t]));

  const opCodes = [
    ...new Set(txns.map((t) => t.operator).filter((c): c is string => !!c)),
  ];
  const billers = opCodes.length
    ? await prisma.biller.findMany({
        where: { code: { in: opCodes } },
        select: { code: true, name: true },
      })
    : [];
  const billerName = new Map(billers.map((b) => [b.code, b.name]));

  return rows.map((r) => {
    if (r.refType !== "Transaction" || !r.refId) return r;
    const t = txnById.get(r.refId);
    if (!t) return r;
    const name = resolveTxnBankName(t.operator, t.request, billerName);
    return { ...r, logo: name && bankLogoSlug(name) ? name : null };
  });
}

// Cap how deep we merge synthetic memos. Reservation memos are read-time overlays,
// so injecting them requires reading real rows from the top; bound that work to a
// sane window. Beyond it (very deep pages) we serve real rows only.
const MEMO_MERGE_CAP = 5000;

const byNewest = (a: LedgerRow, b: LedgerRow): number =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1;

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
    500,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20))
  );
  const direction = searchParams.get("direction"); // CREDIT | DEBIT
  const reason = searchParams.get("reason");
  const q = searchParams.get("q")?.trim();
  // Opt-in: only clients that can render reservation memos (the web Wallet Ledger)
  // request them. Every other consumer (e.g. mobile) gets the real ledger unchanged.
  const includeMemos = searchParams.get("memos") === "1";

  const where: Record<string, unknown> = { userId: user.id };
  if (direction === "CREDIT" || direction === "DEBIT") where.direction = direction;
  if (reason) where.reason = reason;
  if (q) {
    where.OR = [
      { note: { contains: q, mode: "insensitive" } },
      { refId: { contains: q, mode: "insensitive" } },
      { refType: { contains: q, mode: "insensitive" } },
    ];
  }

  // Interleave synthetic payout hold/release memos with the real ledger. Because
  // memos are derived rows (not in WalletTxn), a correct merge needs the real
  // rows FROM THE TOP down to this page; slicing the merged, date-sorted list then
  // yields the exact page. Bounded by MEMO_MERGE_CAP for very deep pages.
  const need = page * pageSize;
  const canInject = includeMemos && need <= MEMO_MERGE_CAP;

  const [txns, total, memos] = await Promise.all([
    prisma.walletTxn.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(canInject ? { take: need } : { skip: (page - 1) * pageSize, take: pageSize }),
    }),
    prisma.walletTxn.count({ where }),
    canInject
      ? buildPayoutLedgerMemos(user.id, { direction, reason, q })
      : Promise.resolve([]),
  ]);

  const realRows: LedgerRow[] = txns.map((t) => ({
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

  if (!canInject) {
    return NextResponse.json({
      txns: await attachBankLogos(realRows),
      total,
      page,
      pageSize,
    });
  }

  const merged = [...realRows, ...memos].sort(byNewest);
  const pageRows = merged.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    txns: await attachBankLogos(pageRows),
    total: total + memos.length,
    page,
    pageSize,
  });
}
