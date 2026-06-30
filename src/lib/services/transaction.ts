import { Prisma, type ServiceCode, type TxnStatus } from "@prisma/client";
import { nanoid } from "nanoid";
import { prisma } from "../db";
import { creditWallet, debitWallet, LedgerError } from "../ledger";
import { add, gt, round } from "../money";
import type { PartnerResult } from "../partners/types";

/**
 * Wraps every external partner call inside our DB ledger so we get:
 *   - Idempotency (duplicate clicks are safe)
 *   - Audit trail (request + response JSON for reconciliation)
 *   - Atomic wallet debit/credit (no orphaned money)
 *
 * Money flow follows the canonical ledger (src/lib/ledger.ts): the reserve,
 * commission and reversal are each Decimal + row-locked + idempotency-keyed
 * WalletTxn entries, so concurrent transactions on the same wallet cannot race
 * into an overspend and retries never double-apply.
 *
 * Use this for ALL money-moving services. Read-only calls (search, plans,
 * fetch bill) can hit the partner directly.
 */
export type RunTxnInput<TIn, TOut> = {
  userId: string;
  service: ServiceCode;
  amount: number;
  idempotencyKey: string;
  customer?: string;
  operator?: string;
  partner: string;
  request: TIn;
  ip?: string;
  device?: string;
  /** Calculate fee + commission BEFORE calling the partner. */
  fee?: number;
  commission?: number;
  /** The actual partner call. */
  call: () => Promise<PartnerResult<TOut>>;
};

export async function runTransaction<TIn, TOut>(
  input: RunTxnInput<TIn, TOut>
): Promise<{ status: TxnStatus; refId: string; data?: TOut; error?: string }> {
  const refId = `TXN${nanoid(10).toUpperCase()}`;

  // Per-user idempotency keys for each distinct money movement. WalletTxn keys
  // are globally unique, so scope by userId to avoid cross-user collisions when
  // two users happen to send the same client-supplied idempotencyKey.
  const baseKey = `txn:${input.userId}:${input.idempotencyKey}`;
  const reserveKey = `${baseKey}:reserve`;
  const commissionKey = `${baseKey}:commission`;
  const reversalKey = `${baseKey}:reversal`;

  // Exact Decimal amounts (never JS float math on money).
  const reserveAmount = round(add(input.amount, input.fee ?? 0));
  const commissionAmount = round(input.commission ?? 0);

  // 1. Idempotency — if we already reserved funds for this key, replay the
  //    original transaction instead of creating a duplicate.
  const existingReserve = await prisma.walletTxn.findUnique({
    where: { idempotencyKey: reserveKey },
  });
  if (existingReserve?.refId) {
    const existingTxn = await prisma.transaction.findUnique({
      where: { id: existingReserve.refId },
    });
    if (existingTxn) {
      return {
        status: existingTxn.status,
        refId: existingTxn.refId,
        data: existingTxn.response as TOut,
      };
    }
  }

  // 2. Reserve money up front via the ledger (row-locked DEBIT).
  let txn;
  try {
    txn = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          refId,
          userId: input.userId,
          service: input.service,
          amount: new Prisma.Decimal(round(input.amount)),
          fee: new Prisma.Decimal(round(input.fee ?? 0)),
          commission: new Prisma.Decimal(commissionAmount),
          status: "PROCESSING",
          customer: input.customer,
          operator: input.operator,
          partner: input.partner,
          request: input.request as Prisma.InputJsonValue,
          ipAddress: input.ip,
          device: input.device,
        },
      });

      await debitWallet(
        {
          userId: input.userId,
          amount: reserveAmount,
          reason: "TRANSACTION",
          refType: "Transaction",
          refId: created.id,
          idempotencyKey: reserveKey,
        },
        tx
      );

      return created;
    });
  } catch (e) {
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_FUNDS") {
      return { status: "FAILED" as const, refId, error: "Insufficient wallet balance" };
    }
    throw e;
  }

  // 3. Hit the partner OUTSIDE the DB transaction.
  let result: PartnerResult<TOut>;
  try {
    result = await input.call();
  } catch (e) {
    result = { ok: false, code: "EXCEPTION", message: (e as Error).message };
  }

  // 4. Settle: mark SUCCESS and credit commission, or refund the reservation.
  if (result.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          status: "SUCCESS",
          response: result.raw as Prisma.InputJsonValue,
          partnerTxnId: result.partnerTxnId,
        },
      });
      if (gt(commissionAmount, 0)) {
        await creditWallet(
          {
            userId: input.userId,
            amount: commissionAmount,
            reason: "COMMISSION",
            refType: "Transaction",
            refId: txn.id,
            idempotencyKey: commissionKey,
          },
          tx
        );
      }
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: "txn.success",
          entity: "Transaction",
          entityId: txn.id,
          meta: { refId, partner: input.partner },
        },
      });
    });
    return { status: "SUCCESS", refId, data: result.data };
  }

  // Failure path — refund the reserved money via the ledger (REVERSAL credit).
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: txn.id },
      data: {
        status: "FAILED",
        errorCode: result.code,
        errorMessage: result.message,
        response: (result.raw ?? null) as Prisma.InputJsonValue,
      },
    });
    await creditWallet(
      {
        userId: input.userId,
        amount: reserveAmount,
        reason: "REVERSAL",
        refType: "Transaction",
        refId: txn.id,
        idempotencyKey: reversalKey,
      },
      tx
    );
    await tx.auditLog.create({
      data: {
        userId: input.userId,
        action: "txn.failed",
        entity: "Transaction",
        entityId: txn.id,
        meta: { refId, code: result.code, message: result.message },
      },
    });
  });

  return { status: "FAILED", refId, error: result.message };
}
