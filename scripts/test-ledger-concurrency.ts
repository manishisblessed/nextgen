/**
 * Concurrency + idempotency sanity check for the Phase 0 ledger.
 *
 * Proves the two properties the money-path migration relies on:
 *   1. No overspend under concurrent debits (pessimistic row lock serializes
 *      writers, so two simultaneous approvals of the same wallet can't both win).
 *   2. Idempotency — replaying the same idempotencyKey applies the money once.
 *
 * Run (PowerShell, from repo root):
 *   npx tsx scripts/test-ledger-concurrency.ts
 *
 * It creates a throwaway user, exercises the ledger against your real DB, then
 * deletes everything it created. Safe to run repeatedly. Exits non-zero on
 * failure so it can gate CI.
 */
import { prisma } from "../src/lib/db";
import { creditWallet, debitWallet, getBalances, LedgerError } from "../src/lib/ledger";
import { toFixedString } from "../src/lib/money";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`  [${tag}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function makeUser(balance: string) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return prisma.user.create({
    data: {
      name: "Ledger Concurrency Test",
      email: `ledger-test-${suffix}@example.invalid`,
      phone: `+99${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 15),
      passwordHash: "x",
      role: "RETAILER",
      walletBalance: balance,
      heldBalance: "0",
    },
    select: { id: true },
  });
}

async function cleanup(userId: string) {
  await prisma.walletTxn.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function testNoOverspend() {
  console.log("\nTest 1: two concurrent debits of 80 from a balance of 100");
  const user = await makeUser("100.00");
  try {
    // Fire both debits at the same time. Each opens its own transaction and
    // races for the SELECT ... FOR UPDATE lock on the user row.
    const results = await Promise.allSettled([
      debitWallet({ userId: user.id, amount: "80.00", reason: "TRANSACTION", refId: "race-a" }),
      debitWallet({ userId: user.id, amount: "80.00", reason: "TRANSACTION", refId: "race-b" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    const insufficient = rejected.filter(
      (r) => r.reason instanceof LedgerError && r.reason.code === "INSUFFICIENT_FUNDS"
    ).length;

    check("exactly one debit succeeded", fulfilled === 1, `succeeded=${fulfilled}`);
    check(
      "the loser failed with INSUFFICIENT_FUNDS",
      insufficient === 1,
      `insufficient=${insufficient}`
    );

    const { walletBalance, spendable } = await getBalances(user.id);
    check(
      "final wallet balance is exactly 20.00 (never negative)",
      toFixedString(walletBalance) === "20.00",
      `balance=${toFixedString(walletBalance)} spendable=${toFixedString(spendable)}`
    );

    const debits = await prisma.walletTxn.count({
      where: { userId: user.id, direction: "DEBIT" },
    });
    check("only one DEBIT WalletTxn was written", debits === 1, `debits=${debits}`);
  } finally {
    await cleanup(user.id);
  }
}

async function testIdempotency() {
  console.log("\nTest 2: replaying the same idempotencyKey applies money once");
  const user = await makeUser("0.00");
  const key = `ledger-test:credit:${Math.random().toString(36).slice(2)}`;
  try {
    await creditWallet({ userId: user.id, amount: "50.00", reason: "TOPUP", idempotencyKey: key });
    // Replay (e.g. duplicate webhook / retry) with the same key.
    await creditWallet({ userId: user.id, amount: "50.00", reason: "TOPUP", idempotencyKey: key });

    const { walletBalance } = await getBalances(user.id);
    check(
      "balance credited exactly once",
      toFixedString(walletBalance) === "50.00",
      `balance=${toFixedString(walletBalance)}`
    );

    const credits = await prisma.walletTxn.count({
      where: { userId: user.id, idempotencyKey: key },
    });
    check("only one CREDIT WalletTxn exists for the key", credits === 1, `credits=${credits}`);
  } finally {
    await cleanup(user.id);
  }
}

async function main() {
  console.log("Ledger concurrency / idempotency sanity check");
  await testNoOverspend();
  await testIdempotency();

  console.log(
    `\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Test crashed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
