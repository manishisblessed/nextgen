/**
 * Enable Row-Level Security on every table in the public schema.
 *
 * Why this is safe for this app:
 *  - The app accesses Postgres ONLY via Prisma, connected as the `postgres`
 *    role that OWNS all tables. Table owners bypass RLS (we deliberately do
 *    not use FORCE ROW LEVEL SECURITY), so Prisma is unaffected.
 *  - Supabase's PostgREST (`anon` / `authenticated` roles) is what the
 *    "Table publicly accessible" security alert is about — with RLS enabled
 *    and no policies defined, those roles can no longer read or write rows.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Abort unless the connected role owns the tables (owner bypasses RLS).
const ownership = await prisma.$queryRawUnsafe(`
  select current_user as connected_role,
         count(*) filter (where t.tableowner <> current_user) as not_owned
  from pg_tables t
  where t.schemaname = 'public'
`);
console.log(`Connected as: ${ownership[0].connected_role}`);
if (Number(ownership[0].not_owned) > 0) {
  console.error(
    `ABORT: ${ownership[0].not_owned} table(s) are not owned by the connected role — enabling RLS could lock the app out.`
  );
  process.exit(1);
}

const tables = await prisma.$queryRawUnsafe(`
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  order by c.relname
`);

for (const { table_name } of tables) {
  await prisma.$executeRawUnsafe(
    `alter table public."${table_name}" enable row level security`
  );
  console.log(`RLS enabled: ${table_name}`);
}

// Sanity check: owner can still read after enabling RLS.
const users = await prisma.user.count();
console.log(`\nSanity check — User rows visible via Prisma: ${users}`);
console.log(`Done. ${tables.length} table(s) updated.`);
await prisma.$disconnect();
