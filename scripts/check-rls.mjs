import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(`
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`);
const off = rows.filter((r) => !r.rls_enabled);
console.log(`Total public tables: ${rows.length}`);
console.log(`RLS disabled on: ${off.length}`);
for (const r of off) console.log(`  - ${r.table_name}`);
await prisma.$disconnect();
