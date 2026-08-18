/**
 * READ-ONLY: reconcile a TIME WINDOW between the Same Day partner API and our
 * local mirror — used to confirm a partner-side backfill (e.g. their 17:27–18:30
 * IST 18-Aug ingestion delay) has fully landed on our side.
 *
 * Pulls the tenant-wide partner feed for the window (all statuses, paginated),
 * then reports any partner rows whose canonical ref is MISSING from our mirror.
 *
 * Run on the allow-listed EC2 box, repo root:
 *   POS_FROM_ISO=2026-08-18T11:00:00.000Z POS_TO_ISO=2026-08-18T13:30:00.000Z \
 *     node_modules/.bin/tsx scripts/probe-pos-window.ts
 * Defaults to 2026-08-18 17:00–19:00 IST (11:30–13:30 UTC). Makes NO writes.
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

const FROM_ISO = (process.env.POS_FROM_ISO ?? "2026-08-18T11:30:00.000Z").trim();
const TO_ISO = (process.env.POS_TO_ISO ?? "2026-08-18T13:30:00.000Z").trim();

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { getPosTransactions, canonicalPosCaptureRef } = await import("../src/lib/partners/sameday-pos");

  console.log(`\n=== POS window reconciliation ===`);
  console.log(`  window (UTC): ${FROM_ISO} → ${TO_ISO}`);
  console.log(`  window (IST): ${new Date(FROM_ISO).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} → ${new Date(TO_ISO).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n`);

  // 1. Tenant-wide partner feed for the window (all statuses).
  const partner: { ref: string; id: string; tid: string; status: string; amount: string; at: string }[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await getPosTransactions({
      date_from: FROM_ISO,
      date_to: TO_ISO,
      terminal_id: null,
      status: null,
      page,
      page_size: 100,
    });
    if (!res.ok) {
      console.log("  ✗ partner error:", res.error.error?.message ?? "fetch failed");
      process.exit(1);
    }
    for (const r of res.data.data ?? []) {
      partner.push({
        ref: canonicalPosCaptureRef({ rrn: r.rrn, terminalId: r.terminal_id }),
        id: r.razorpay_txn_id,
        tid: r.terminal_id,
        status: r.status,
        amount: r.amount,
        at: r.txn_time,
      });
    }
    if (!res.data.pagination?.has_next) break;
  }
  console.log(`  partner rows in window: ${partner.length}`);

  // 2. Which of those refs exist in our mirror?
  const refs = partner.map((p) => p.ref);
  const have = refs.length
    ? await prisma.posTransactionMirror.findMany({
        where: { transactionRef: { in: refs } },
        select: { transactionRef: true },
      })
    : [];
  const haveSet = new Set(have.map((h) => h.transactionRef));
  const missing = partner.filter((p) => !haveSet.has(p.ref));

  console.log(`  present in our mirror: ${haveSet.size}`);
  console.log(`  MISSING from our mirror: ${missing.length}`);
  for (const m of missing)
    console.log("    ✗", JSON.stringify({ id: m.id, tid: m.tid, status: m.status, amount: m.amount, at: m.at }));

  console.log("\n=== Verdict ===");
  if (partner.length === 0) {
    console.log("Partner reports NO transactions in this window — nothing to reconcile.");
  } else if (missing.length === 0) {
    console.log(`All ${partner.length} partner transactions in the window are present in our mirror. Fully backfilled.`);
  } else {
    const tids = [...new Set(missing.map((m) => m.tid))];
    console.log(`${missing.length} partner transaction(s) are NOT yet in our mirror.`);
    console.log(`Affected terminals: ${tids.join(", ")}`);
    console.log("Next sweep (2-day lookback) should pull them; if they persist, reply to Same Day with these TIDs + window.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ Probe failed:", e);
  process.exit(1);
});
