/**
 * Backfill Transaction.fee for Chagans PG top-ups that settled BEFORE the fix.
 *
 * These transactions store the MDR in `response.mdr` (JSON) but never populated
 * the indexed `fee` column — the PG Report and Summary were under-counting fees.
 *
 * Usage (on server):
 *   npx tsx scripts/backfill-pg-fee.ts          # dry-run
 *   npx tsx scripts/backfill-pg-fee.ts --apply   # apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.transaction.findMany({
    where: {
      partner: "CHAGANS_PG",
      status: "SUCCESS",
      fee: new Prisma.Decimal(0),
    },
    select: { id: true, refId: true, amount: true, fee: true, response: true },
  });

  console.log(`Found ${rows.length} Chagans SUCCESS transactions with fee = 0`);

  let updated = 0;
  for (const row of rows) {
    const resp = row.response as Record<string, unknown> | null;
    const mdr = resp?.mdr;
    if (typeof mdr !== "number" || mdr <= 0) {
      console.log(`  SKIP ${row.refId}: no mdr in response (mdr=${mdr})`);
      continue;
    }
    console.log(`  ${apply ? "UPDATE" : "WOULD UPDATE"} ${row.refId}: fee 0 → ${mdr}`);
    if (apply) {
      await prisma.transaction.update({
        where: { id: row.id },
        data: { fee: new Prisma.Decimal(mdr) },
      });
      updated++;
    }
  }

  console.log(apply ? `Done. Updated ${updated} rows.` : `Dry-run. ${rows.length} rows would be updated. Pass --apply to commit.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
