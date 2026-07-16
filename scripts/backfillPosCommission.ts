/**
 * Backfill POS rental subscription commission values.
 *
 * Commission on a subscription is the spread the ASSIGNER (createdById) earns:
 *   commission = max(0, thisRent − upstreamCost)
 * where `upstreamCost` is the effective rent of the assigner's OWN active
 * subscription on the same machine (0 if they have none).
 *
 * Before the multi-tier fix, subscriptions created "bottom-up" (e.g. a retailer
 * sub set up before the distributor's upstream sub existed) could keep a stale
 * spread computed against a ₹0 upstream cost — inflating the stored commission.
 * This script recomputes `commission` for every ACTIVE subscription using the
 * exact same formula as the subscribe route, so billing cascades the correct
 * amount at each tier.
 *
 * SAFETY: dry-run by default — it only PRINTS what would change. Pass `--apply`
 * to actually write the corrected values.
 *
 * Run (PowerShell, repo root, with DATABASE_URL set):
 *   npx tsx scripts/backfillPosCommission.ts            # dry-run (no writes)
 *   npx tsx scripts/backfillPosCommission.ts --apply    # write changes
 *
 * Idempotent: running again after --apply is a no-op once everything matches.
 */
import { prisma } from "../src/lib/db";
import { dec, toNumber } from "../src/lib/money";

const APPLY = process.argv.includes("--apply");

/** Round to 2 decimals the same way the subscribe/admin routes do. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const startedAt = new Date();
  console.log(
    `[backfillPosCommission] starting at ${startedAt.toISOString()} — mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`
  );

  // All active subscriptions with the fields needed to compute the spread.
  const subs = await prisma.posSubscription.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      machineId: true,
      userId: true,
      createdById: true,
      monthlyRent: true,
      commission: true,
      plan: { select: { monthlyRent: true } },
      user: { select: { name: true, role: true } },
      machine: { select: { tid: true, serial: true } },
    },
  });

  if (subs.length === 0) {
    console.log("[backfillPosCommission] no active subscriptions found — nothing to do.");
    return;
  }

  // Effective rent per (machine, subscriber) — the cost anchor an upstream tier
  // charges. `upstreamCost` for a sub is the effective rent of its creator's
  // own subscription on the same machine.
  const effectiveRentByMachineUser = new Map<string, number>();
  for (const s of subs) {
    const rent = toNumber(dec(s.monthlyRent ?? s.plan.monthlyRent));
    effectiveRentByMachineUser.set(`${s.machineId}:${s.userId}`, rent);
  }

  const changes: Array<{
    id: string;
    label: string;
    from: number;
    to: number;
    thisRent: number;
    upstreamCost: number;
  }> = [];

  for (const s of subs) {
    const thisRent = toNumber(dec(s.monthlyRent ?? s.plan.monthlyRent));
    const upstreamCost = s.createdById
      ? effectiveRentByMachineUser.get(`${s.machineId}:${s.createdById}`) ?? 0
      : 0;
    const expected = Math.max(0, round2(thisRent - upstreamCost));
    const current = toNumber(dec(s.commission));

    if (expected !== current) {
      const machineLabel = s.machine.tid ?? s.machine.serial ?? s.machineId.slice(0, 8);
      changes.push({
        id: s.id,
        label: `${s.user.name} (${s.user.role}) · machine ${machineLabel}`,
        from: current,
        to: expected,
        thisRent,
        upstreamCost,
      });
    }
  }

  if (changes.length === 0) {
    console.log(
      `[backfillPosCommission] all ${subs.length} active subscription(s) already have correct commission — nothing to fix.`
    );
    return;
  }

  console.log(
    `[backfillPosCommission] ${changes.length} of ${subs.length} active subscription(s) need correction:`
  );
  for (const c of changes) {
    console.log(
      `  - ${c.label}\n` +
        `      rent ₹${c.thisRent} − upstream ₹${c.upstreamCost}  =>  commission ₹${c.from} → ₹${c.to}`
    );
  }

  if (!APPLY) {
    console.log(
      `\n[backfillPosCommission] DRY-RUN complete. No changes written. Re-run with --apply to commit.`
    );
    return;
  }

  let updated = 0;
  for (const c of changes) {
    await prisma.posSubscription.update({
      where: { id: c.id },
      data: { commission: dec(c.to) },
    });
    updated++;
  }

  console.log(`\n[backfillPosCommission] done — updated ${updated} subscription(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[backfillPosCommission] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
