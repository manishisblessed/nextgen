/**
 * READ-ONLY: search the Same Day partner API TENANT-WIDE (no terminal filter)
 * for one transaction, to distinguish:
 *   • the partner API omits the txn entirely (partner endpoint gap), vs.
 *   • the partner API has it but the terminal_id FILTER drops it (filter bug),
 *   • the partner API has it under a DIFFERENT terminal_id than we stored.
 *
 * Run on the allow-listed EC2 box, repo root:
 *   node_modules/.bin/tsx scripts/probe-pos-tenantwide.ts
 * Override:
 *   POS_TXN_ID=PL_7211256230 POS_RRN=000000000076 POS_DATE_FROM=2026-08-16 \
 *     POS_DATE_TO=2026-08-18 node_modules/.bin/tsx scripts/probe-pos-tenantwide.ts
 * Makes NO writes.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}
loadEnvFile();

const TXN_ID = (process.env.POS_TXN_ID ?? "PL_7211256230").trim();
const RRN = (process.env.POS_RRN ?? "000000000076").trim();
const TID = (process.env.POS_TID ?? "43135139").trim();
const DATE_FROM = (process.env.POS_DATE_FROM ?? "2026-08-16").trim();
const DATE_TO = (process.env.POS_DATE_TO ?? "2026-08-18").trim();

async function main() {
  const { getPosTransactions } = await import("../src/lib/partners/sameday-pos");

  const from = new Date(`${DATE_FROM}T00:00:00.000Z`).toISOString();
  const to = new Date(`${DATE_TO}T23:59:59.999Z`).toISOString();

  console.log(`\n=== Tenant-wide partner search (${DATE_FROM} → ${DATE_TO}) ===`);
  console.log(`  looking for txn id "${TXN_ID}" / rrn "${RRN}"\n`);

  let scanned = 0;
  let matchById: unknown = null;
  const matchByRrn: unknown[] = [];
  const terminalsSeen = new Set<string>();
  let ourTerminalCount = 0;

  for (let page = 1; page <= 100; page++) {
    const res = await getPosTransactions({
      date_from: from,
      date_to: to,
      terminal_id: null, // TENANT-WIDE (exactly what the recon sweep does)
      status: null,
      page,
      page_size: 100,
    });
    if (!res.ok) {
      console.log("  ✗ partner error:", res.error.error?.message ?? "fetch failed");
      break;
    }
    const rows = res.data.data ?? [];
    for (const r of rows) {
      scanned++;
      terminalsSeen.add(r.terminal_id);
      if (r.terminal_id === TID) ourTerminalCount++;
      if (r.razorpay_txn_id === TXN_ID) matchById = r;
      if ((r.rrn ?? "").trim() === RRN) matchByRrn.push(r);
    }
    if (page === 1) {
      console.log(`  pagination total_records: ${res.data.pagination?.total_records ?? "?"}`);
    }
    if (!res.data.pagination?.has_next || rows.length === 0) break;
  }

  console.log(`\n  scanned ${scanned} tenant-wide rows across ${terminalsSeen.size} terminals`);
  console.log(`  rows on our terminal ${TID}: ${ourTerminalCount}`);
  console.log(`\n  match by txn id "${TXN_ID}": ${matchById ? "FOUND" : "NOT FOUND"}`);
  if (matchById) console.log("   ", JSON.stringify(matchById));
  console.log(`  match by rrn "${RRN}": ${matchByRrn.length}`);
  for (const r of matchByRrn) console.log("   ", JSON.stringify(r));

  console.log("\n=== Verdict ===");
  const found = matchById || matchByRrn.length > 0;
  if (found) {
    const term = (matchById as { terminal_id?: string } | null)?.terminal_id ??
      (matchByRrn[0] as { terminal_id?: string } | undefined)?.terminal_id;
    if (term && term !== TID) {
      console.log(`Partner HAS the txn, but under terminal_id="${term}" (we stored "${TID}").`);
      console.log("→ terminal mismatch, not a deletion. Our terminal-scoped query missed it.");
    } else {
      console.log("Partner HAS the txn tenant-wide but the terminal-scoped query missed it →");
      console.log("partner terminal_id FILTER is dropping this row. A partner-side filter bug.");
    }
  } else {
    console.log(`Partner API does NOT return ${TXN_ID}/RRN ${RRN} tenant-wide for ${DATE_FROM}..${DATE_TO}`);
    console.log("even though Same Day's own dashboard shows it → the row exists in their system");
    console.log("but their PARTNER API does not expose it. This is the exact discrepancy to raise.");
  }
}

main().catch((e) => {
  console.error("\n✗ Probe failed:", e);
  process.exit(1);
});
