import { Prisma, type WalletReason, type WalletTxn } from "@prisma/client";
import { prisma } from "./db";
import { add, sub, gte, dec, type Money } from "./money";

/**
 * Canonical wallet ledger.
 *
 * Every rupee that moves MUST go through one of these functions. They guarantee:
 *
 *  1. Exact Decimal math (never JS floats).
 *  2. Pessimistic row locking (`SELECT ... FOR UPDATE`) so concurrent operations
 *     on the same wallet cannot race into an overspend.
 *  3. Idempotency — a money movement tagged with an `idempotencyKey` is applied
 *     at most once, even under retries or duplicate webhook deliveries.
 *  4. A `balanceAfter` snapshot on every WalletTxn (powers the Account passbook).
 *
 * Balance model (authorization-hold style):
 *   - walletBalance  = total funds owned by the user
 *   - heldBalance    = funds reserved for in-flight operations (pending payout)
 *   - spendable      = walletBalance - heldBalance
 *
 * Holds/releases are *reservations* and do NOT create a WalletTxn (they are not
 * real money movements). The actual DEBIT lands on `captureHold` when the
 * operation is confirmed, so the passbook reflects only settled movements.
 */

export type LedgerErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_HOLD"
  | "INVALID_AMOUNT";

export class LedgerError extends Error {
  constructor(public code: LedgerErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LedgerError";
  }
}

type Tx = Prisma.TransactionClient;

/** Run `fn` inside the provided transaction, or open a fresh one. */
async function withTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction((t) => fn(t));
}

/**
 * Lock a user row for the remainder of the transaction and return fresh
 * balances. Must be called inside a transaction.
 */
async function lockUser(tx: Tx, userId: string) {
  // FOR UPDATE serializes concurrent writers on this row.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, walletBalance: true, heldBalance: true },
  });
  if (!user) throw new LedgerError("INVALID_AMOUNT", "User not found");
  return user;
}

function assertPositive(amount: Money | string | number) {
  if (!dec(amount).gt(0)) throw new LedgerError("INVALID_AMOUNT", "Amount must be > 0");
}

/** If a WalletTxn with this idempotency key already exists, return it. */
async function findByIdempotencyKey(tx: Tx, key: string): Promise<WalletTxn | null> {
  return tx.walletTxn.findUnique({ where: { idempotencyKey: key } });
}

export type WalletMovement = {
  userId: string;
  amount: Money | string | number;
  reason: WalletReason;
  refType?: string;
  refId?: string;
  note?: string;
  /** Strongly recommended for any retryable / externally-triggered movement. */
  idempotencyKey?: string;
};

/** Credit (add) funds to a user's wallet. */
export async function creditWallet(m: WalletMovement, tx?: Tx): Promise<WalletTxn> {
  assertPositive(m.amount);
  return withTx(tx, async (t) => {
    if (m.idempotencyKey) {
      const existing = await findByIdempotencyKey(t, m.idempotencyKey);
      if (existing) return existing;
    }
    const user = await lockUser(t, m.userId);
    const newBalance = add(user.walletBalance, m.amount);
    await t.user.update({
      where: { id: m.userId },
      data: { walletBalance: newBalance },
    });
    return t.walletTxn.create({
      data: {
        userId: m.userId,
        direction: "CREDIT",
        reason: m.reason,
        amount: new Prisma.Decimal(dec(m.amount)),
        balanceAfter: new Prisma.Decimal(newBalance),
        refType: m.refType,
        refId: m.refId,
        note: m.note,
        idempotencyKey: m.idempotencyKey,
      },
    });
  });
}

/** Debit (remove) funds from a user's spendable balance. */
export async function debitWallet(m: WalletMovement, tx?: Tx): Promise<WalletTxn> {
  assertPositive(m.amount);
  return withTx(tx, async (t) => {
    if (m.idempotencyKey) {
      const existing = await findByIdempotencyKey(t, m.idempotencyKey);
      if (existing) return existing;
    }
    const user = await lockUser(t, m.userId);
    const spendable = sub(user.walletBalance, user.heldBalance);
    if (!gte(spendable, m.amount)) {
      throw new LedgerError("INSUFFICIENT_FUNDS");
    }
    const newBalance = sub(user.walletBalance, m.amount);
    await t.user.update({
      where: { id: m.userId },
      data: { walletBalance: newBalance },
    });
    return t.walletTxn.create({
      data: {
        userId: m.userId,
        direction: "DEBIT",
        reason: m.reason,
        amount: new Prisma.Decimal(dec(m.amount)),
        balanceAfter: new Prisma.Decimal(newBalance),
        refType: m.refType,
        refId: m.refId,
        note: m.note,
        idempotencyKey: m.idempotencyKey,
      },
    });
  });
}

export type HoldInput = {
  userId: string;
  amount: Money | string | number;
};

/**
 * Reserve funds from spendable balance (authorization hold). Does not create a
 * WalletTxn. Idempotency is the caller's responsibility — call this exactly once
 * inside the same transaction that transitions the owning entity (e.g. a
 * PayoutRequest) into its "held" state.
 */
export async function holdFunds(m: HoldInput, tx?: Tx): Promise<{ heldBalance: Money }> {
  assertPositive(m.amount);
  return withTx(tx, async (t) => {
    const user = await lockUser(t, m.userId);
    const spendable = sub(user.walletBalance, user.heldBalance);
    if (!gte(spendable, m.amount)) {
      throw new LedgerError("INSUFFICIENT_FUNDS");
    }
    const newHeld = add(user.heldBalance, m.amount);
    await t.user.update({
      where: { id: m.userId },
      data: { heldBalance: newHeld },
    });
    return { heldBalance: newHeld };
  });
}

/** Release a previously-held reservation back to spendable (e.g. payout failed). */
export async function releaseHold(m: HoldInput, tx?: Tx): Promise<{ heldBalance: Money }> {
  assertPositive(m.amount);
  return withTx(tx, async (t) => {
    const user = await lockUser(t, m.userId);
    if (!gte(user.heldBalance, m.amount)) {
      throw new LedgerError("INSUFFICIENT_HOLD");
    }
    const newHeld = sub(user.heldBalance, m.amount);
    await t.user.update({
      where: { id: m.userId },
      data: { heldBalance: newHeld },
    });
    return { heldBalance: newHeld };
  });
}

/**
 * Finalize a hold into a real debit (e.g. payout confirmed by BulkPe). Reduces
 * both heldBalance and walletBalance and writes the settling WalletTxn. This is
 * the entry that appears in the user's passbook.
 */
export async function captureHold(m: WalletMovement, tx?: Tx): Promise<WalletTxn> {
  assertPositive(m.amount);
  return withTx(tx, async (t) => {
    if (m.idempotencyKey) {
      const existing = await findByIdempotencyKey(t, m.idempotencyKey);
      if (existing) return existing;
    }
    const user = await lockUser(t, m.userId);
    if (!gte(user.heldBalance, m.amount)) {
      throw new LedgerError("INSUFFICIENT_HOLD");
    }
    const newBalance = sub(user.walletBalance, m.amount);
    const newHeld = sub(user.heldBalance, m.amount);
    await t.user.update({
      where: { id: m.userId },
      data: { walletBalance: newBalance, heldBalance: newHeld },
    });
    return t.walletTxn.create({
      data: {
        userId: m.userId,
        direction: "DEBIT",
        reason: m.reason,
        amount: new Prisma.Decimal(dec(m.amount)),
        balanceAfter: new Prisma.Decimal(newBalance),
        refType: m.refType,
        refId: m.refId,
        note: m.note,
        idempotencyKey: m.idempotencyKey,
      },
    });
  });
}

/** Read-only snapshot of a user's balances. */
export async function getBalances(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true, heldBalance: true },
  });
  if (!user) throw new LedgerError("INVALID_AMOUNT", "User not found");
  return {
    walletBalance: user.walletBalance as Money,
    heldBalance: user.heldBalance as Money,
    spendable: sub(user.walletBalance, user.heldBalance),
  };
}
