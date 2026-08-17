/**
 * READ-ONLY diagnostic for a single POS transaction that shows CAPTURED on the
 * ADMIN slip but does NOT appear on the retailer (client) side.
 *
 * It answers, definitively, WHY a retailer can't see a captured swipe by
 * checking the three independent systems that gate visibility + money:
 *   1. Mirror row      — is the capture in PosTransactionMirror (what feeds the UI)?
 *   2. Machine + owner — is the terminal assigned to an ACTIVE retailer, and when?
 *   3. Scope clamp      — does the swipe fall AFTER the assignment `from` date?
 *   4. Settlement       — is there a PosSettlementEntry (money path), or was it
 *                         parked (NO_SCHEME / SKIPPED) and never created?
 *   5. RRN collision    — does the canonical ref collide with other swipes on the
 *                         same terminal (padded/reused RRN silently dedupes rows)?
 *
 * Run (PowerShell, repo root) — defaults target the slip in question:
 *   npx tsx scripts/diagnose-pos-txn.ts
 * Override any identifier:
 *   $env:POS_TID="43135139"; $env:POS_RRN="000000000076"; `
 *     $env:POS_TXN_ID="PL_7211256230"; npx tsx scripts/diagnose-pos-txn.ts
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
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}
loadEnvFile();

// Identifiers off the slip in the report (all overridable via env).
const TID = (process.env.POS_TID ?? "43135139").trim();
const RRN = (process.env.POS_RRN ?? "000000000076").trim();
const TXN_ID = (process.env.POS_TXN_ID ?? "PL_7211256230").trim();

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { canonicalPosCaptureRef } = await import("../src/lib/partners/sameday-pos");

  const canonRef = canonicalPosCaptureRef({ rrn: RRN, terminalId: TID });
  console.log(`\n=== POS transaction diagnostic ===`);
  console.log(`  TID:            ${TID}`);
  console.log(`  RRN:            ${RRN}`);
  console.log(`  Partner txn id: ${TXN_ID}`);
  console.log(`  Canonical ref:  ${canonRef}\n`);

  // ── 1. Mirror row (the read-model that BOTH admin + retailer feeds query) ──
  const mirrorByRef = await prisma.posTransactionMirror.findUnique({
    where: { transactionRef: canonRef },
  });
  const mirrorById = TXN_ID
    ? await prisma.posTransactionMirror.findFirst({ where: { razorpayTxnId: TXN_ID } })
    : null;
  const mirror = mirrorByRef ?? mirrorById;

  console.log("── 1. Mirror (PosTransactionMirror) ──");
  if (!mirror) {
    console.log("  ✗ NO mirror row by canonical ref OR by partner txn id.");
    console.log("    → The capture was never written to the read-model. If the ADMIN slip");
    console.log("      still shows it, the admin was viewing the PARTNER feed live, not the");
    console.log("      mirror. Run the reconciliation sweep to backfill the mirror.");
  } else {
    console.log(
      "  ✓ found:",
      JSON.stringify({
        transactionRef: mirror.transactionRef,
        status: mirror.status,
        amount: mirror.amount.toString(),
        terminalId: mirror.terminalId,
        txnTime: mirror.txnTime.toISOString(),
        source: mirror.source,
        razorpayTxnId: mirror.razorpayTxnId,
        rrn: mirror.rrn,
      })
    );
    if (mirrorByRef && mirrorById && mirrorByRef.id !== mirrorById.id) {
      console.log("  ⚠ ref-lookup and id-lookup returned DIFFERENT rows — possible ref collision.");
    }
  }

  // ── 2. Machine + owner ──
  console.log("\n── 2. Machine (PosMachine) + owner ──");
  const machine = await prisma.posMachine.findFirst({
    where: { tid: TID },
    select: {
      id: true,
      tid: true,
      mid: true,
      status: true,
      assignedUserId: true,
      assignedAt: true,
      brandId: true,
      company: true,
      provider: true,
    },
  });
  let owner: { id: string; status: string; name: string | null; shopName: string | null; userCode: string | null } | null =
    null;
  if (!machine) {
    console.log(`  ✗ NO PosMachine with tid=${TID}. The terminal isn't in the local fleet →`);
    console.log("    it can't be assigned to anyone → NO retailer can see it and it can't settle.");
  } else {
    console.log("  ✓ machine:", JSON.stringify(machine));
    if (!machine.assignedUserId) {
      console.log("  ✗ UNASSIGNED → no retailer owns this terminal, so nobody sees its feed.");
    } else {
      owner = await prisma.user.findUnique({
        where: { id: machine.assignedUserId },
        select: { id: true, status: true, name: true, shopName: true, userCode: true },
      });
      console.log("  owner:", JSON.stringify(owner));
      if (owner && owner.status !== "ACTIVE") {
        console.log(`  ✗ owner status is ${owner.status} (not ACTIVE) → settlement is SKIPPED.`);
      }
    }
  }

  // ── 3. Scope clamp (per-terminal assignment-date lower bound) ──
  console.log("\n── 3. Retailer scope clamp ──");
  if (machine?.assignedAt && mirror) {
    const hidden = mirror.txnTime < machine.assignedAt;
    console.log(`  assignedAt: ${machine.assignedAt.toISOString()}`);
    console.log(`  txnTime:    ${mirror.txnTime.toISOString()}`);
    if (hidden) {
      console.log("  ✗ swipe happened BEFORE the assignment date → the `from` clamp HIDES it");
      console.log("    from the current holder's feed (they only see rows on/after assignment).");
    } else {
      console.log("  ✓ swipe is on/after the assignment date → NOT clamped out.");
    }
  } else {
    console.log("  (skipped — need both a mirror row and an assignedAt to evaluate.)");
  }

  // ── 4. Settlement entry (the money path) ──
  console.log("\n── 4. Settlement (PosSettlementEntry) ──");
  const entry = await prisma.posSettlementEntry.findUnique({
    where: { transactionRef: canonRef },
  });
  if (!entry) {
    console.log("  ✗ NO settlement entry for this ref. It was never queued/credited.");
    console.log("    Likely causes: ingest never ran, terminal unassigned/owner inactive");
    console.log("    (SKIPPED), or no MDR/scheme resolved (NO_SCHEME → parked, not persisted).");
  } else {
    console.log(
      "  ✓ entry:",
      JSON.stringify({
        status: entry.status,
        mode: entry.mode,
        gross: entry.grossAmount.toString(),
        mdr: entry.mdrAmount.toString(),
        net: entry.netAmount.toString(),
        settledAt: entry.settledAt?.toISOString() ?? null,
        settledVia: entry.settledVia,
        walletTxnId: entry.walletTxnId,
        userId: entry.userId,
      })
    );
  }

  // ── 5. RRN collision check ──
  console.log("\n── 5. RRN / canonical-ref collision ──");
  const sameRrn = await prisma.posTransactionMirror.findMany({
    where: { terminalId: TID, rrn: RRN },
    select: { transactionRef: true, razorpayTxnId: true, amount: true, txnTime: true, status: true },
    orderBy: { txnTime: "desc" },
    take: 20,
  });
  console.log(`  mirror rows with tid=${TID} AND rrn=${RRN}: ${sameRrn.length}`);
  for (const r of sameRrn) console.log("   ", JSON.stringify({ ...r, amount: r.amount.toString() }));
  if (sameRrn.length <= 1) {
    // The mirror upsert is keyed on canonical ref, so a reused RRN would OVERWRITE
    // rather than create a second row — surface that risk explicitly.
    const partnerRows = await prisma.posTransactionMirror.count({
      where: { terminalId: TID, txnTime: mirror ? { equals: mirror.txnTime } : undefined },
    });
    console.log(
      `  (only ${sameRrn.length} row for this RRN. If the acquirer reuses RRN "${RRN}" across` +
        ` swipes, earlier ones were OVERWRITTEN by the canonical-ref upsert — ${partnerRows} row(s)` +
        " share this txnTime.)"
    );
  } else {
    console.log("  ⚠ multiple swipes share this RRN → canonical ref collides; only ONE survives.");
  }

  // ── Verdict ──
  console.log("\n=== Verdict ===");
  if (!mirror) {
    console.log("Not in the read-model → retailer CANNOT see it. Backfill via reconciliation sweep.");
  } else if (!machine) {
    console.log("Terminal not in local fleet → unassignable → invisible to every retailer.");
  } else if (!machine.assignedUserId) {
    console.log("Terminal is UNASSIGNED → no retailer owns the feed → nobody sees it. Assign it.");
  } else if (machine.assignedAt && mirror.txnTime < machine.assignedAt) {
    console.log("Assignment-date clamp is hiding a pre-assignment swipe from the current holder.");
  } else if (owner && owner.status !== "ACTIVE") {
    console.log("Owner is not ACTIVE → feed access + settlement blocked.");
  } else {
    console.log(
      "Mirror row exists, terminal is assigned to an ACTIVE retailer, and the swipe is\n" +
        "after assignment → it SHOULD appear. Check the retailer's date-range / status /\n" +
        "payment-mode filters on the POS Transactions screen for the swipe day."
    );
  }
  if (!entry) console.log("Separately: NO wallet credit yet (no settlement entry) — see section 4.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ Diagnostic failed:", e);
  process.exit(1);
});
