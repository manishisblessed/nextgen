// Standalone seed for the On/Off Services catalog.
//   Run:  npm run db:seed:services
// Idempotent — preserves admin `enabled`/`note` choices on existing rows.
import { PrismaClient } from "@prisma/client";
import { seedServiceRoutes } from "../src/lib/services/catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Seeding service routes…");
  const result = await seedServiceRoutes(prisma);
  console.log(`✓ Service routes: +${result.created} new, ${result.updated} refreshed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
