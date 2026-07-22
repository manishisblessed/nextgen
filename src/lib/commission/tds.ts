import type { Prisma, ServiceCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dec, gt, round, type Money } from "@/lib/money";

/**
 * TDS liability ledger.
 *
 * Every commission payout withholds 2% TDS (Section 194H style). The withheld
 * amount is recorded here as a company liability — separate from the wallet
 * ledger — so it can be reconciled and remitted independently. Each entry is
 * idempotency-keyed (`tds:{txnId}:{payeeUserId}`) so replays / duplicate
 * webhook deliveries never double-record the liability.
 */
export async function recordTds(input: {
  txnId: string;
  userId: string; // payee the TDS was withheld from (DT/MD/SD)
  service: ServiceCode;
  tier: string; // DISTRIBUTOR | MASTER | SUPER
  gross: Money | number;
  tds: Money | number;
  commissionCreditId?: string | null;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  if (!gt(dec(input.tds), 0)) return;
  const p = input.tx ?? prisma;
  const idempotencyKey = `tds:${input.txnId}:${input.userId}`;

  const existing = await p.tdsLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (existing) return;

  await p.tdsLedgerEntry.create({
    data: {
      userId: input.userId,
      transactionId: input.txnId,
      commissionCreditId: input.commissionCreditId ?? null,
      service: input.service,
      tier: input.tier,
      grossAmount: round(input.gross),
      tdsRate: dec(0.02),
      tdsAmount: round(input.tds),
      idempotencyKey,
    },
  });
}
