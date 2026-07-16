import { prisma } from "@/lib/db";
import { getPosTransactions } from "@/lib/partners/sameday-pos";
import { distributeMdrCommission } from "@/lib/commission/distribute";
import type { MdrServiceKind } from "@prisma/client";

const up = (v: string | null | undefined) => {
  const s = (v ?? "").trim().toUpperCase();
  return s ? s : undefined;
};

(async () => {
  // 1) Wildcard company on every active POS slab. Same Day sends no bank field,
  //    so a company-pinned POS slab can never match a real capture.
  const upd = await prisma.mdrSlab.updateMany({
    where: { serviceKind: "POS", active: true, company: { not: null } },
    data: { company: null },
  });
  console.log("POS_SLABS_WILDCARDED " + upd.count);

  // 2) Backfill commissions for captures already ingested BEFORE the fix (their
  //    upline earned 0). Only distribute where no credits exist yet, so this is
  //    safe to re-run.
  const res = await getPosTransactions({
    date_from: "2026-07-12T18:30:00.000Z",
    date_to: new Date().toISOString(),
    status: "CAPTURED",
    page: 1,
    page_size: 100,
  });
  if (!res.ok) {
    console.log("FETCH_FAILED " + JSON.stringify(res.error));
    process.exit(1);
  }

  for (const t of res.data.data) {
    const ref = t.razorpay_txn_id || t.external_ref || `SDP-${t.id}`;
    const synthRef = `POS${ref.slice(-10).toUpperCase()}`;
    const txn = await prisma.transaction.findUnique({
      where: { refId: synthRef },
      select: { id: true, userId: true, service: true },
    });
    if (!txn) {
      console.log(`SKIP ${ref} — no synthetic txn (not yet ingested)`);
      continue;
    }
    const existing = await prisma.commissionCredit.count({ where: { transactionId: txn.id } });
    if (existing > 0) {
      console.log(`SKIP ${ref} — already has ${existing} commission credit(s)`);
      continue;
    }
    const credits = await distributeMdrCommission(
      txn.id,
      txn.userId,
      "POS" as MdrServiceKind,
      Number(t.amount),
      txn.service,
      {
        paymentMode: up(t.payment_mode) ?? "CARD",
        cardType: up(t.card_type),
        brandType: up(t.card_brand),
        classification: up(t.card_classification),
      }
    );
    console.log(
      `DISTRIBUTED ${ref} (${t.card_brand} ₹${t.amount}) -> ` +
        JSON.stringify(credits.map((c) => ({ role: c.role, gross: c.gross, tds: c.tds, net: c.amount })))
    );
  }

  process.exit(0);
})();
