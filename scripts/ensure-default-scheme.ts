/**
 * Phase 0 — guarantee exactly one ACTIVE platform default scheme.
 *
 * The global default-scheme fallback (SCHEME_DEFAULT_FALLBACK) prices every
 * user without an explicit active scheme off the single Scheme where
 * isDefault = true AND active = true. This script makes sure that invariant
 * holds BEFORE the flag is switched on in production.
 *
 * Behaviour (idempotent):
 *   - If an active default already exists → prints it, does nothing.
 *   - Else picks a candidate to promote:
 *       1. --name "<scheme name>"  (explicit; must be active)
 *       2. the active scheme named "Next_Gen_Default_Scheme" (convention)
 *       3. the oldest active scheme
 *     …sets it isDefault=true and demotes any stale isDefault rows.
 *   - If NO active scheme exists at all → exits non-zero with guidance (create
 *     one in Scheme Manager first).
 *
 * SAFETY: dry-run by default — only PRINTS the intended change. Pass --apply to
 * write. Multiple stale defaults are always collapsed to one on --apply.
 *
 * Run (PowerShell, repo root, with DATABASE_URL set):
 *   npx tsx scripts/ensure-default-scheme.ts
 *   npx tsx scripts/ensure-default-scheme.ts --apply
 *   npx tsx scripts/ensure-default-scheme.ts --name "Next_Gen_Default_Scheme" --apply
 */
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const CONVENTION_NAME = "Next_Gen_Default_Scheme";

async function main() {
  const explicitName = argValue("name")?.trim();

  const defaults = await prisma.scheme.findMany({
    where: { isDefault: true },
    select: { id: true, name: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  const activeDefaults = defaults.filter((d) => d.active);

  // Healthy state: exactly one ACTIVE default, and no stale duplicates.
  if (activeDefaults.length === 1 && defaults.length === 1) {
    console.log(`✓ Active default scheme already set: "${activeDefaults[0].name}" (${activeDefaults[0].id}). Nothing to do.`);
    return;
  }

  // Pick the scheme to promote.
  let target: { id: string; name: string } | null = null;

  if (activeDefaults.length >= 1) {
    // One or more active defaults already exist — keep the oldest, demote rest.
    target = { id: activeDefaults[0].id, name: activeDefaults[0].name };
  } else if (explicitName) {
    const s = await prisma.scheme.findFirst({ where: { name: explicitName, active: true }, select: { id: true, name: true } });
    if (!s) {
      console.error(`✗ No ACTIVE scheme named "${explicitName}" found. Check the name (case-sensitive) or activate it first.`);
      process.exit(1);
    }
    target = s;
  } else {
    const byConvention = await prisma.scheme.findFirst({ where: { name: CONVENTION_NAME, active: true }, select: { id: true, name: true } });
    const oldest = await prisma.scheme.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    target = byConvention ?? oldest;
  }

  if (!target) {
    console.error("✗ No ACTIVE scheme exists to promote. Create one in Scheme Manager (or seed) first, then re-run.");
    process.exit(1);
  }

  const staleDefaults = defaults.filter((d) => d.id !== target!.id);

  console.log(`Plan:`);
  console.log(`  • Promote to default: "${target.name}" (${target.id})`);
  if (staleDefaults.length > 0)
    console.log(`  • Demote ${staleDefaults.length} other isDefault row(s): ${staleDefaults.map((d) => d.name).join(", ")}`);

  if (!APPLY) {
    console.log(`\n(dry-run) Re-run with --apply to write these changes.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheme.updateMany({ where: { isDefault: true, id: { not: target!.id } }, data: { isDefault: false } });
    await tx.scheme.update({ where: { id: target!.id }, data: { isDefault: true, active: true } });
  });

  console.log(`\n✓ Done. "${target.name}" is now the single active default scheme.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
