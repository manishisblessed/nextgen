import { prisma } from "@/lib/db";
import { debitWallet, creditWallet, LedgerError } from "@/lib/ledger";
import { dec, add, sub as subtract, toNumber, round, mul } from "@/lib/money";
import { getSetting } from "@/lib/settings";

/**
 * POS rental billing — monthly wallet debit per active subscription.
 *
 * Idempotency: one invoice per (subscription, YYYY-MM period) enforced by the
 * unique PosRentalInvoice key + the ledger idempotency key `rent:<sub>:<period>`.
 * Insufficient balance produces a FAILED invoice that the next daily run
 * retries (the ledger key includes the period, so a later success in the same
 * period settles the same invoice exactly once).
 *
 * GST: when subscription.includeGst is true, 18% GST is added on top of the
 * base rent. The subscriber is debited rent + GST.
 *
 * Commission: each subscription stores a commission amount. On successful
 * billing the commission is credited to the assigner (createdById). This
 * cascades up the hierarchy — each tier's subscription has its own commission.
 */

const GST_RATE = dec("0.18"); // 18% GST
const TDS_RATE = dec("0.02"); // 2% TDS deducted from commission

/** IST billing period key (YYYY-MM). */
export function istPeriodKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .slice(0, 7);
}

/** IST day-of-month (1-31). */
function istDayOfMonth(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", day: "numeric" }).format(now)
  );
}

/** Compute the total debit for a subscription: base rent + optional GST. */
export function computeRentalAmounts(baseRent: number | string, includeGst: boolean) {
  const rent = dec(baseRent);
  const gst = includeGst ? round(mul(rent, GST_RATE)) : dec(0);
  const total = add(rent, gst);
  return { rent, gst, total };
}

export async function runPosRentalBilling(now = new Date()): Promise<{
  processed: number;
  billed: number;
  failed: number;
  skipped: number;
}> {
  const cfg = await getSetting("pos.rental_billing");
  if (!cfg.enabled) return { processed: 0, billed: 0, failed: 0, skipped: 0 };

  const periodKey = istPeriodKey(now);
  const today = istDayOfMonth(now);

  const subs = await prisma.posSubscription.findMany({
    where: { status: "ACTIVE", billingDay: { lte: today } },
    include: { plan: true },
  });

  // Build a set of (machineId, userId) pairs where the subscriber has created
  // a further-downstream active subscription on the same machine. These
  // upstream subscriptions are cost anchors only — billing is handled at the
  // lowest active tier.
  const downstreamCreators = await prisma.posSubscription.findMany({
    where: { status: "ACTIVE" },
    select: { machineId: true, createdById: true },
  });
  const hasDownstream = new Set(
    downstreamCreators
      .filter((d) => d.createdById)
      .map((d) => `${d.machineId}:${d.createdById}`),
  );

  let billed = 0;
  let failed = 0;
  let skipped = 0;

  for (const sub of subs) {
    // Skip billing if the subscriber has created a downstream subscription
    // for this machine — they are billed indirectly via the commission spread.
    if (hasDownstream.has(`${sub.machineId}:${sub.userId}`)) {
      skipped++;
      continue;
    }

    const existing = await prisma.posRentalInvoice.findUnique({
      where: { subscriptionId_periodKey: { subscriptionId: sub.id, periodKey } },
    });
    if (existing && existing.status !== "FAILED") {
      skipped++;
      continue;
    }

    const effectiveRent = sub.monthlyRent ?? sub.plan.monthlyRent;
    const { rent, gst, total } = computeRentalAmounts(
      effectiveRent.toString(),
      sub.includeGst
    );

    if (!total.gt(0)) {
      skipped++;
      continue;
    }

    const commissionAmount = dec(sub.commission);

    try {
      // Debit subscriber (rent + GST)
      const txn = await debitWallet({
        userId: sub.userId,
        amount: total,
        reason: "RENTAL",
        refType: "PosSubscription",
        refId: sub.id,
        note: `POS rental ${sub.plan.name} · ${periodKey}${sub.includeGst ? " (incl. 18% GST)" : ""}`,
        idempotencyKey: `rent:${sub.id}:${periodKey}`,
      });

      // Credit commission to the assigner (parent). When the subscription
      // carries GST, 18% GST is added on top of the commission spread; 2% TDS
      // is deducted from the base spread only (GST is a pass-through, not
      // income). net = spread + GST(spread) − TDS(spread).
      let commissionTxnId: string | null = null;
      if (commissionAmount.gt(0) && sub.createdById) {
        const commissionGst = sub.includeGst ? round(mul(commissionAmount, GST_RATE)) : dec(0);
        const tdsAmount = round(mul(commissionAmount, TDS_RATE));
        const netCommission = add(subtract(commissionAmount, tdsAmount), commissionGst);
        try {
          if (netCommission.gt(0)) {
            const commTxn = await creditWallet({
              userId: sub.createdById,
              amount: netCommission,
              reason: "COMMISSION",
              refType: "PosSubscription",
              refId: sub.id,
              note: `POS rental commission · ${sub.plan.name} · ${periodKey} (₹${toNumber(commissionAmount)} spread${sub.includeGst ? ` + ₹${toNumber(commissionGst)} GST` : ""} − 2% TDS ₹${toNumber(tdsAmount)})`,
              idempotencyKey: `rent-comm:${sub.id}:${periodKey}`,
            });
            commissionTxnId = commTxn.id;
          }
        } catch (e) {
          console.error(`[pos-rental] commission credit failed for sub ${sub.id}:`, e);
        }
      }

      if (existing) {
        await prisma.posRentalInvoice.update({
          where: { id: existing.id },
          data: {
            status: "PAID",
            amount: rent,
            gstAmount: gst,
            totalAmount: total,
            commissionAmount: commissionAmount,
            walletTxnId: txn.id,
            commissionTxnId,
            detail: null,
          },
        });
      } else {
        await prisma.posRentalInvoice.create({
          data: {
            subscriptionId: sub.id,
            periodKey,
            amount: rent,
            gstAmount: gst,
            totalAmount: total,
            commissionAmount: commissionAmount,
            status: "PAID",
            walletTxnId: txn.id,
            commissionTxnId,
          },
        });
      }
      billed++;
    } catch (e) {
      const detail =
        e instanceof LedgerError && e.code === "INSUFFICIENT_FUNDS"
          ? "insufficient wallet balance"
          : e instanceof Error
          ? e.message
          : "ledger error";
      if (existing) {
        await prisma.posRentalInvoice.update({ where: { id: existing.id }, data: { detail } });
      } else {
        await prisma.posRentalInvoice.create({
          data: {
            subscriptionId: sub.id,
            periodKey,
            amount: rent,
            gstAmount: gst,
            totalAmount: total,
            commissionAmount: commissionAmount,
            status: "FAILED",
            detail,
          },
        });
      }
      failed++;
    }
  }

  return { processed: subs.length, billed, failed, skipped };
}

/** Rental revenue rollup for the admin billing view. */
export async function rentalBillingSummary(periodKey = istPeriodKey()) {
  const [byStatus, activeSubs] = await Promise.all([
    prisma.posRentalInvoice.groupBy({
      by: ["status"],
      where: { periodKey },
      _count: true,
      _sum: { amount: true, gstAmount: true, totalAmount: true, commissionAmount: true },
    }),
    prisma.posSubscription.count({ where: { status: "ACTIVE" } }),
  ]);
  const get = (s: string) => byStatus.find((b) => b.status === s);
  return {
    periodKey,
    activeSubscriptions: activeSubs,
    paidCount: get("PAID")?._count ?? 0,
    paidAmount: toNumber(dec(get("PAID")?._sum.totalAmount ?? 0)),
    paidGst: toNumber(dec(get("PAID")?._sum.gstAmount ?? 0)),
    paidCommission: toNumber(dec(get("PAID")?._sum.commissionAmount ?? 0)),
    failedCount: get("FAILED")?._count ?? 0,
    failedAmount: toNumber(dec(get("FAILED")?._sum.totalAmount ?? 0)),
    waivedCount: get("WAIVED")?._count ?? 0,
  };
}
