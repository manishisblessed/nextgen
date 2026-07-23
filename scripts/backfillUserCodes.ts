/**
 * Backfill sequential userCodes for every existing network user that doesn't
 * have one yet (RT/DT/MD/SD + 4-digit sequence starting at 0101).
 *
 * Ordered by createdAt so the oldest user in each tier gets the lowest number.
 * Idempotent: users that already have a code are skipped.
 *
 * Run (PowerShell, repo root, with DATABASE_URL set):
 *   npx tsx scripts/backfillUserCodes.ts
 */
import { prisma } from "../src/lib/db";
import { buildUserCode, USER_CODE_PREFIX } from "../src/lib/utils";

async function main() {
  const roles = Object.keys(USER_CODE_PREFIX);
  let assigned = 0;

  for (const role of roles) {
    const prefix = USER_CODE_PREFIX[role];

    const highestExisting = await prisma.user.findFirst({
      where: { userCode: { startsWith: prefix } },
      orderBy: { userCode: "desc" },
      select: { userCode: true },
    });

    let nextSeq = 1;
    if (highestExisting?.userCode) {
      const numPart = parseInt(highestExisting.userCode.slice(prefix.length), 10);
      if (!isNaN(numPart)) nextSeq = numPart - 100 + 1;
    }

    const usersWithoutCode = await prisma.user.findMany({
      where: { role: role as never, userCode: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });

    for (const u of usersWithoutCode) {
      const code = buildUserCode(role, nextSeq);
      await prisma.user.update({ where: { id: u.id }, data: { userCode: code } });
      console.log(`  ${code}  ←  ${u.name}`);
      nextSeq++;
      assigned++;
    }
  }

  console.log(`\n✔ Backfill complete — assigned ${assigned} user code(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
