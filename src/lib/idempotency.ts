import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Generic idempotency for non-ledger operations (e.g. "submit a payout
 * request"). A client sends an Idempotency-Key header; replaying the same key
 * returns the original result instead of creating a duplicate.
 *
 * Money movements use WalletTxn.idempotencyKey instead (see ledger.ts).
 */

export class IdempotencyInProgressError extends Error {
  public statusCode = 409;
  constructor() {
    super("A request with this idempotency key is already being processed");
    this.name = "IdempotencyInProgressError";
  }
}

export type IdempotencyOptions = {
  key: string;
  scope: string;
  userId?: string;
  /** How long the stored result remains replayable. Default 24h. */
  ttlSec?: number;
};

/**
 * Run `fn` at most once per (scope, key). On replay:
 *   - COMPLETED  -> returns the stored response.
 *   - IN_PROGRESS -> throws {@link IdempotencyInProgressError} (409).
 */
export async function withIdempotency<T>(
  opts: IdempotencyOptions,
  fn: () => Promise<T>
): Promise<T> {
  const compositeKey = `${opts.scope}:${opts.key}`;
  const ttlSec = opts.ttlSec ?? 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  // Atomically claim the key. ON CONFLICT DO NOTHING -> 0 rows means it existed.
  const inserted = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "IdempotencyKey" ("id", "key", "scope", "userId", "status", "expiresAt")
    VALUES (${nanoid()}, ${compositeKey}, ${opts.scope}, ${opts.userId ?? null}, 'IN_PROGRESS', ${expiresAt})
    ON CONFLICT ("key") DO NOTHING
    RETURNING "id"
  `;

  const isNew = inserted.length > 0;

  if (!isNew) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: compositeKey },
    });
    if (existing?.status === "COMPLETED") {
      return existing.response as T;
    }
    throw new IdempotencyInProgressError();
  }

  try {
    const result = await fn();
    await prisma.idempotencyKey.update({
      where: { key: compositeKey },
      data: {
        status: "COMPLETED",
        response: (result ?? null) as Prisma.InputJsonValue,
      },
    });
    return result;
  } catch (err) {
    // Release the claim so a legitimate retry can proceed.
    await prisma.idempotencyKey
      .delete({ where: { key: compositeKey } })
      .catch(() => {});
    throw err;
  }
}
