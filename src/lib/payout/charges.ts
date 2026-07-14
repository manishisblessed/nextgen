import type { PayoutMode } from "@prisma/client";
import { add, dec, gt, percentOf, round, type Money } from "@/lib/money";
import { getEffectiveRate, PAYOUT_MODE_SERVICE } from "@/lib/scheme/resolver";

/**
 * Payout pricing.
 *
 * Charge model: the service charge is ON TOP. The beneficiary receives the
 * full `amount`; the user is debited:
 *
 *   totalDebit = amount + serviceCharge + GST(serviceCharge)
 *
 * GST is 18% of the service charge (not of the payout amount), rounded at
 * money scale. All math goes through Decimal helpers — never JS floats.
 *
 * Service charge is a flat fee per slab/mode (typical for IMPS/NEFT/RTGS/UPI
 * payouts). Tune SLABS without touching the math.
 */

export const GST_PERCENT = 18;

type Slab = { upTo: number | null; charge: number };

// Flat service charge by mode and amount band (₹). `upTo: null` = no upper bound.
const SLABS: Record<PayoutMode, Slab[]> = {
  IMPS: [
    { upTo: 1000, charge: 5 },
    { upTo: 25000, charge: 10 },
    { upTo: null, charge: 15 },
  ],
  UPI: [
    { upTo: 1000, charge: 3 },
    { upTo: 25000, charge: 6 },
    { upTo: null, charge: 10 },
  ],
  NEFT: [
    { upTo: 10000, charge: 5 },
    { upTo: null, charge: 10 },
  ],
  RTGS: [{ upTo: null, charge: 20 }],
};

export type PayoutQuote = {
  amount: Money;
  serviceCharge: Money;
  gst: Money;
  totalDebit: Money;
};

/** Resolve the flat service charge for an amount + mode. */
export function payoutServiceCharge(amount: Money | string | number, mode: PayoutMode): Money {
  const amt = dec(amount);
  const slabs = SLABS[mode] ?? SLABS.IMPS;
  for (const slab of slabs) {
    if (slab.upTo === null || !gt(amt, slab.upTo)) {
      return round(slab.charge);
    }
  }
  return round(slabs[slabs.length - 1].charge);
}

/**
 * Compute the full money breakdown for a payout. This is the single source of
 * truth used by the quote endpoint, the submit route, and the UI preview — the
 * client value is never trusted.
 */
export function quotePayout(amount: Money | string | number, mode: PayoutMode): PayoutQuote {
  const amt = round(amount);
  const serviceCharge = payoutServiceCharge(amt, mode);
  const gst = percentOf(serviceCharge, GST_PERCENT);
  const totalDebit = round(add(add(amt, serviceCharge), gst));
  return { amount: amt, serviceCharge, gst, totalDebit };
}

/**
 * User-aware payout quote. The service charge resolves from the user's OWN
 * assigned Scheme via getEffectiveRate (cascade model — no default-scheme
 * fallback; the scheme gate blocks unassigned network users upstream). If the
 * scheme has no slab for this amount/mode, the static SLABS price the charge
 * so staff accounts and unconfigured bands stay functional.
 */
export async function quotePayoutForUser(
  userId: string,
  amount: Money | string | number,
  mode: PayoutMode
): Promise<PayoutQuote & { source: string }> {
  const amt = round(amount);
  const service = PAYOUT_MODE_SERVICE[mode];

  let serviceCharge: Money;
  let source = "STATIC_SLABS";
  if (service) {
    const rate = await getEffectiveRate(userId, service, amt);
    if (rate.source !== "NONE") {
      serviceCharge = round(rate.charge);
      source = rate.source;
    } else {
      serviceCharge = payoutServiceCharge(amt, mode);
    }
  } else {
    serviceCharge = payoutServiceCharge(amt, mode);
  }

  const gst = percentOf(serviceCharge, GST_PERCENT);
  const totalDebit = round(add(add(amt, serviceCharge), gst));
  return { amount: amt, serviceCharge, gst, totalDebit, source };
}
