/**
 * READ-ONLY: ask the Same Day partner API directly what it holds for one
 * terminal, and reconcile it against our local mirror — to explain why a
 * transaction shows CAPTURED on OUR dashboard but not on Same Day's.
 *
 * For terminal POS_TID it:
 *   1. Pulls the partner feed (ALL statuses, then CAPTURED-only) over a lookback
 *      window, paginated — the exact calls our sweep/ingest make.
 *   2. Reports whether POS_TXN_ID / POS_RRN is present and with what STATUS.
 *   3. Flags RRN reuse on the terminal (canonical ref = SDPOS:<tid>:<rrn>, so a
 *      reused RRN silently collapses many swipes into ONE mirror row).
 *   4. Diffs partner refs vs our PosTransactionMirror rows for the terminal:
 *        • in mirror but NOT in partner  → orphan (sweep never deletes)
 *        • status mismatch               → stale (aged out of lookback)
 *
 * Run on an allow-listed host (the EC2 box), repo root:
 *   node_modules/.bin/tsx scripts/probe-pos-partner.ts
 * Override:
 *   POS_TID=43135139 POS_RRN=000000000076 POS_TXN_ID=PL_7211256230 \
 *     POS_LOOKBACK_DAYS=40 node_modules/.bin/tsx scripts/probe-pos-partner.ts
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

const TID = (process.env.POS_TID ?? "43135139").trim();
const RRN = (process.env.POS_RRN ?? "000000000076").trim();
const TXN_ID = (process.env.POS_TXN_ID ?? "PL_7211256230").trim();
const LOOKBACK_DAYS = Number(process.env.POS_LOOKBACK_DAYS ?? "40");

type Row = import("../src/lib/partners/sameday-pos.types").PosTransaction;

async function pullAll(
  getPosTransactions: typeof import("../src/lib/partners/sameday-pos").getPosTransactions,
  status: "CAPTURED" | null
): Promise<{ rows: Row[]; error?: string; total?: number }> {
  const to = new Date();
  const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const rows: Row[] = [];
  let total: number | undefined;
  for (let page = 1; page <= 20; page++) {
    const res = await getPosTransactions({
      date_from: from.toISOString(),
      date_to: to.toISOString(),
      terminal_id: TID,
      status,
      page,
      page_size: 100,
    });
    if (!res.ok) return { rows, error: res.error.error?.message ?? "partner fetch failed" };
    total = res.data.pagination?.total_records ?? total;
    rows.push(...(res.data.data ?? []));
    if (!res.data.pagination?.has_next) break;
  }
  return { rows, total };
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { getPosTransactions, canonicalPosCaptureRef } = await import("../src/lib/partners/sameday-pos");

  const canonRef = canonicalPosCaptureRef({ rrn: RRN, terminalId: TID });
  console.log(`\n=== Same Day partner probe — terminal ${TID} (last ${LOOKBACK_DAYS}d) ===`);
  console.log(`  target txn: ${TXN_ID}   rrn: ${RRN}   canonical ref: ${canonRef}\n`);

  // 1. What does the partner return for this terminal — ALL statuses?
  console.log("── Partner feed: ALL statuses (what the recon sweep pulls) ──");
  const all = await pullAll(getPosTransactions, null);
  if (all.error) {
    console.log("  ✗ partner error:", all.error);
  } else {
    console.log(`  partner rows: ${all.rows.length} (pagination total_records: ${all.total ?? "?"})`);
    const byStatus: Record<string, number> = {};
    for (const r of all.rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    console.log("  by status:", JSON.stringify(byStatus));
    for (const r of all.rows) {
      console.log(
        "   ",
        JSON.stringify({
          id: r.razorpay_txn_id,
          amount: r.amount,
          status: r.status,
          rrn: r.rrn,
          brand: r.card_brand,
          at: r.txn_time,
        })
      );
    }
  }

  // 2. Is our exact target present, and with what status?
  console.log("\n── Target lookup in partner feed ──");
  const byId = all.rows.find((r) => r.razorpay_txn_id === TXN_ID);
  const byRrn = all.rows.filter((r) => (r.rrn ?? "").trim() === RRN);
  console.log(`  by txn id "${TXN_ID}": ${byId ? `FOUND (status=${byId.status})` : "NOT FOUND"}`);
  console.log(`  by rrn "${RRN}": ${byRrn.length} row(s)`);
  for (const r of byRrn)
    console.log("    →", JSON.stringify({ id: r.razorpay_txn_id, amount: r.amount, status: r.status, at: r.txn_time }));

  // 3. CAPTURED-only view (what the settlement ingest + our slip trust).
  console.log("\n── Partner feed: CAPTURED-only (what ingest/settlement pulls) ──");
  const cap = await pullAll(getPosTransactions, "CAPTURED");
  if (cap.error) console.log("  ✗ partner error:", cap.error);
  else {
    console.log(`  captured rows: ${cap.rows.length}`);
    const capHasTarget = cap.rows.some((r) => r.razorpay_txn_id === TXN_ID);
    console.log(`  target present in CAPTURED set: ${capHasTarget ? "YES" : "NO"}`);
  }

  // 4. RRN reuse across the terminal → canonical-ref collision detector.
  console.log("\n── RRN reuse on this terminal (collision risk) ──");
  const rrnCounts = new Map<string, number>();
  for (const r of all.rows) {
    const k = (r.rrn ?? "").trim() || "(empty)";
    rrnCounts.set(k, (rrnCounts.get(k) ?? 0) + 1);
  }
  const reused = [...rrnCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  if (reused.length === 0) {
    console.log("  no reused RRNs — every swipe maps to a distinct canonical ref.");
  } else {
    console.log("  ⚠ REUSED RRNs (each collapses to ONE mirror row):");
    for (const [rrn, n] of reused) console.log(`     rrn=${rrn} → ${n} distinct partner swipes`);
  }

  // 5. Diff partner vs our mirror for this terminal.
  console.log("\n── Mirror vs partner diff (terminal) ──");
  const mirrorRows = await prisma.posTransactionMirror.findMany({
    where: { terminalId: TID },
    select: { transactionRef: true, razorpayTxnId: true, status: true, amount: true, rrn: true, txnTime: true },
    orderBy: { txnTime: "desc" },
    take: 500,
  });
  console.log(`  mirror rows for terminal: ${mirrorRows.length}`);
  const partnerRefs = new Set(
    all.rows.map((r) => canonicalPosCaptureRef({ rrn: r.rrn, terminalId: r.terminal_id }))
  );
  const partnerStatusByRef = new Map(
    all.rows.map((r) => [canonicalPosCaptureRef({ rrn: r.rrn, terminalId: r.terminal_id }), r.status])
  );
  const orphans = mirrorRows.filter((m) => !partnerRefs.has(m.transactionRef));
  const mismatched = mirrorRows.filter(
    (m) => partnerStatusByRef.has(m.transactionRef) && partnerStatusByRef.get(m.transactionRef) !== m.status
  );
  console.log(`  orphans (in mirror, NOT in partner feed): ${orphans.length}`);
  for (const m of orphans)
    console.log(
      "    ✗",
      JSON.stringify({ ref: m.transactionRef, id: m.razorpayTxnId, status: m.status, amount: m.amount.toString(), at: m.txnTime })
    );
  console.log(`  status mismatches (mirror vs partner): ${mismatched.length}`);
  for (const m of mismatched)
    console.log(
      "    ~",
      JSON.stringify({ ref: m.transactionRef, mirror: m.status, partner: partnerStatusByRef.get(m.transactionRef) })
    );

  // ── Verdict ──
  console.log("\n=== Verdict ===");
  const targetOrphan = orphans.some((m) => m.razorpayTxnId === TXN_ID) || (!byId && byRrn.length === 0);
  if (all.error) {
    console.log("Partner API errored — can't conclude. Re-run when the partner is reachable.");
  } else if (byId) {
    console.log(`Partner STILL returns ${TXN_ID} (status=${byId.status}). It exists at Same Day →`);
    console.log("their dashboard view was just FILTERED. Our mirror is correct.");
  } else if (byRrn.length > 0) {
    console.log(`Partner returns RRN ${RRN} but under a DIFFERENT txn id (${byRrn.map((r) => r.razorpay_txn_id).join(", ")}).`);
    console.log("→ canonical-ref (RRN) collision: our single mirror row was overwritten to the latest swipe.");
  } else if (targetOrphan) {
    console.log(`Partner NO LONGER returns ${TXN_ID}/RRN ${RRN} for this terminal within ${LOOKBACK_DAYS}d →`);
    console.log("our mirror row is an ORPHAN. The sweep is upsert-only (never deletes) and the 2-day");
    console.log("status window has passed, so a void/delete at Same Day never propagated. Needs a");
    console.log("tombstone/reconcile-delete or a targeted cleanup of this row.");
  } else {
    console.log("Inconclusive — see the sections above.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ Probe failed:", e);
  process.exit(1);
});
