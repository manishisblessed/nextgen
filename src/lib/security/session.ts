import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { invalidateSessionValidation } from "./sessionValidationCache";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Bump a user's `tokenVersion`, invalidating every outstanding session token
 * for that user. Call this on:
 *   - logout (NextAuth `signOut` event),
 *   - role / status / permission changes (privilege change),
 *   - any forced sign-out (account compromise, password reset).
 *
 * Every JWT embeds the version it was minted with; the auth callbacks reject
 * tokens whose version no longer matches the DB. This is the server-side
 * counterpart to the no-store cache controls: even a replayed session cookie is
 * useless once the version moves.
 *
 * Best-effort by default: never let a failed bump break the calling flow when
 * `swallow` is true (e.g. logout should still proceed).
 */
export async function bumpTokenVersion(
  userId: string,
  opts: { db?: Db; swallow?: boolean } = {}
): Promise<void> {
  const client = opts.db ?? prisma;
  try {
    await client.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    // Drop the cached validation snapshot so the invalidation is instant on
    // this instance instead of waiting out the cache TTL.
    invalidateSessionValidation(userId);
  } catch (err) {
    if (!opts.swallow) throw err;
  }
}
