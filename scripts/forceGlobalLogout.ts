/**
 * One-shot global session kill-switch (Phase 12, Task 9).
 *
 * Increments `tokenVersion` for EVERY user, which instantly invalidates every
 * outstanding JWT/NextAuth session across all roles. The auth callbacks
 * (src/lib/auth-server.ts) compare each request's `token.tokenVersion` against
 * `User.tokenVersion` and force a fresh login on mismatch — so the moment this
 * runs, all pre-existing sessions are dead and users must re-authenticate.
 *
 * WHEN TO RUN
 *   - Immediately AFTER deploying the cache-hardening fix, to evict any session
 *     cookies that pre-date the fix (e.g. minted during/before a breach).
 *   - Any time you suspect session/cookie compromise (post-incident response).
 *
 * Run (PowerShell, from repo root, with DATABASE_URL set in the environment):
 *   npx tsx scripts/forceGlobalLogout.ts
 *
 * Idempotent in effect: running it again simply bumps the version once more and
 * re-evicts everyone. It moves no money and touches only `User.tokenVersion`.
 */
import { prisma } from "../src/lib/db";

async function main() {
  const startedAt = new Date();
  console.log(`[forceGlobalLogout] starting at ${startedAt.toISOString()}`);

  // Single atomic statement: UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1;
  const affected = await prisma.$executeRaw`
    UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1
  `;

  console.log(
    `[forceGlobalLogout] done — bumped tokenVersion for ${affected} user(s). ` +
      `All existing sessions are now invalid; users must log in again.`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[forceGlobalLogout] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
