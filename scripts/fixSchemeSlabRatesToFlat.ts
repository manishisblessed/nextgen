/**
 * Fix BBPS/Payout scheme-slab rate types to FLAT.
 *
 * Every service slab (SchemeSlab) belongs to a BBPS or Payout service, which by
 * business rule is always a flat ₹ amount — never a percentage. A wrong default
 * (`commissionType = PERCENT`) meant commissions entered as e.g. `2.5` (intended
 * ₹2.5) were stored as PERCENT and therefore:
 *   - displayed as "250.00%", and
 *   - paid out by the resolver as amount × 2.5 = 250% of every transaction.
 *
 * This script flips both `chargeType` and `commissionType` to FLAT for every
 * SchemeSlab, WITHOUT touching the stored values (2.5 stays 2.5, now meaning
 * ₹2.5). MDR slabs (POS/PG/QR) are percentage-based and are left untouched.
 *
 * Run (PowerShell, repo root, with DATABASE_URL set):
 *   npx tsx scripts/fixSchemeSlabRatesToFlat.ts
 *
 * Idempotent: running again is a no-op once everything is FLAT.
 */
import { prisma } from "../src/lib/db";

async function main() {
  const startedAt = new Date();
  console.log(`[fixSchemeSlabRatesToFlat] starting at ${startedAt.toISOString()}`);

  const affected = await prisma.schemeSlab.findMany({
    where: { OR: [{ chargeType: "PERCENT" }, { commissionType: "PERCENT" }] },
    select: {
      id: true,
      schemeId: true,
      service: true,
      chargeType: true,
      chargeValue: true,
      commissionType: true,
      commissionValue: true,
    },
  });

  if (affected.length === 0) {
    console.log("[fixSchemeSlabRatesToFlat] nothing to fix — all slabs already FLAT.");
    return;
  }

  console.log(`[fixSchemeSlabRatesToFlat] fixing ${affected.length} slab(s):`);
  for (const s of affected) {
    console.log(
      `  - ${s.service} (scheme ${s.schemeId}) ` +
        `charge ${s.chargeType} ${Number(s.chargeValue)} / ` +
        `commission ${s.commissionType} ${Number(s.commissionValue)}  ->  FLAT (values unchanged)`
    );
  }

  const res = await prisma.schemeSlab.updateMany({
    where: { OR: [{ chargeType: "PERCENT" }, { commissionType: "PERCENT" }] },
    data: { chargeType: "FLAT", commissionType: "FLAT" },
  });

  console.log(`[fixSchemeSlabRatesToFlat] done — updated ${res.count} slab(s) to FLAT.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[fixSchemeSlabRatesToFlat] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
