import { Prisma, type ServiceCode, type TxnStatus } from "@prisma/client";
import { nanoid } from "nanoid";
import { prisma } from "../db";
import type { PartnerResult } from "../partners/types";

/**
 * Wraps every external partner call inside our DB ledger so we get:
 *   - Idempotency (duplicate clicks are safe)
 *   - Audit trail (request + response JSON for reconciliation)
 *   - Atomic wallet debit/credit (no orphaned money)
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

  // 1. Idempotency check — if this key already exists for this user, return it.
  const existing = await prisma.transaction.findFirst({
    where: {
      userId: input.userId,
      request: { path: ["idempotencyKey"], equals: input.idempotencyKey }
    }
  });
  if (existing) {
    return { status: existing.status, refId: existing.refId, data: existing.response as TOut };
  }

  // 2. Reserve money up front (DEBIT then refund on failure).
  let txn;
  try {
  txn = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    if (Number(user.walletBalance) < input.amount + (input.fee ?? 0)) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const newBalance = Number(user.walletBalance) - input.amount - (input.fee ?? 0);
    await tx.user.update({ where: { id: user.id }, data: { walletBalance: newBalance } });

    const created = await tx.transaction.create({
      data: {
        refId,
        userId: input.userId,
        service: input.service,
        amount: new Prisma.Decimal(input.amount),
        fee: new Prisma.Decimal(input.fee ?? 0),
        commission: new Prisma.Decimal(input.commission ?? 0),
        status: "PROCESSING",
        customer: input.customer,
        operator: input.operator,
        partner: input.partner,
        request: input.request as Prisma.InputJsonValue,
        ipAddress: input.ip,
        device: input.device
      }
    });

    await tx.walletTxn.create({
      data: {
        userId: input.userId,
        direction: "DEBIT",
        reason: "TRANSACTION",
        amount: new Prisma.Decimal(input.amount + (input.fee ?? 0)),
        balanceAfter: new Prisma.Decimal(newBalance),
        refType: "Transaction",
        refId: created.id
      }
    });
    return created;
  });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
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

  // 4. Update status and either credit commission or refund.
  if (result.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          status: "SUCCESS",
          response: result.raw as Prisma.InputJsonValue,
          partnerTxnId: result.partnerTxnId
        }
      });
      if (input.commission && input.commission > 0) {
        const u = await tx.user.update({
          where: { id: input.userId },
          data: { walletBalance: { increment: input.commission } }
        });
        await tx.walletTxn.create({
          data: {
            userId: input.userId,
            direction: "CREDIT",
            reason: "COMMISSION",
            amount: new Prisma.Decimal(input.commission),
            balanceAfter: u.walletBalance,
            refType: "Transaction",
            refId: txn.id
          }
        });
      }
      await tx.auditLog.create({
        data: { userId: input.userId, action: "txn.success", entity: "Transaction", entityId: txn.id, meta: { refId, partner: input.partner } }
      });
    });
    return { status: "SUCCESS", refId, data: result.data };
  }

  // Failure path — refund the reserved money.
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: txn.id },
      data: { status: "FAILED", errorCode: result.code, errorMessage: result.message, response: (result.raw ?? null) as Prisma.InputJsonValue }
    });
    const u = await tx.user.update({
      where: { id: input.userId },
      data: { walletBalance: { increment: input.amount + (input.fee ?? 0) } }
    });
    await tx.walletTxn.create({
      data: {
        userId: input.userId,
        direction: "CREDIT",
        reason: "REVERSAL",
        amount: new Prisma.Decimal(input.amount + (input.fee ?? 0)),
        balanceAfter: u.walletBalance,
        refType: "Transaction",
        refId: txn.id
      }
    });
    await tx.auditLog.create({
      data: { userId: input.userId, action: "txn.failed", entity: "Transaction", entityId: txn.id, meta: { refId, code: result.code, message: result.message } }
    });
  });

  return { status: "FAILED", refId, error: result.message };
}
