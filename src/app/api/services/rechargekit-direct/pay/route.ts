import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertLivenessReady } from "@/lib/security/livenessGate";
import { requireTxnPin } from "@/lib/security/txnPin";
import { clientIp } from "@/lib/security/audit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { BBPS_PRICE_SCOPES } from "@/lib/services/priceScope";
import { getEffectiveRate, withGst } from "@/lib/scheme/resolver";
import { toNumber, dec, sub, round } from "@/lib/money";
import { runTransaction } from "@/lib/services/transaction";
import { chagansCcPayBill } from "@/lib/partners/chagans-cc-bill";
import { AuthError } from "@/lib/auth-server";

const Body = z
  .object({
    /** Chagans biller ID (billerId from /operators or /billers-params). */
    billerId: z.string().min(1, "billerId is required"),
    /** Human-readable biller name (for transaction operator label). */
    billerName: z.string().min(1, "billerName is required"),
    /**
     * enquiryId from /billers-params — session token valid 30 minutes.
     * Must be the same ID used in the preceding /fetch-bill call.
     */
    enquiryId: z.string().min(1, "enquiryId is required"),
    /**
     * Consumer input parameters (param1, param2, …) as filled by the user.
     * Stored in the transaction audit log but NOT re-sent to the pay API —
     * the enquiryId already encapsulates the bill context on Chagans' side.
     */
    parameters: z.record(z.string(), z.string()),
    /** Bill amount to pay (₹). */
    amount: z.number().positive().max(500000),
    /** Optional PAN — pass empty string if not collected. */
    customerPan: z.string().default(""),
    /** Client-generated idempotency key (prevent duplicate charges on retry). */
    idempotencyKey: z.string().min(8),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * POST /api/services/rechargekit-direct/pay
 *
 * Initiates a credit card bill payment via the Chagans CC Bill API V2.
 * Wrapped by runTransaction for idempotency, ledger atomicity, and auto-refund
 * on failure.
 *
 * Pre-conditions (enforced here):
 *   - Authenticated RETAILER with liveness passed
 *   - Service enabled (RECHARGEKIT_DIRECT / "Offline CC Bill Payment")
 *   - Transaction PIN verified
 *   - Rate limited
 *
 * Money flow:
 *   1. Wallet debited by (amount + fee) via runTransaction reserve
 *   2. chagansCcPayBill called — synchronous, returns SUCCESS or FAILED
 *   3. On SUCCESS: transaction marked SUCCESS, commission distributed
 *   4. On FAILURE: wallet auto-refunded (REVERSAL credit)
 *   5. On TIMEOUT/NETWORK: transaction stays PROCESSING (DO NOT retry)
 *
 * CRITICAL: on timeout/network error callers MUST NOT blind-retry this
 * endpoint — the provider may have already debited. The transaction is left
 * PROCESSING for the recon sweep to finalise.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError(
        "Offline CC Bill Payment is available for retailers only",
        403
      );
    await assertServiceEnabled(SERVICE_KEYS.RECHARGEKIT_DIRECT, {
      name: "Offline CC Bill Payment",
      userId: user.id,
      role: user.role,
    });
    await assertLivenessReady(user);
    await enforceRateLimit(`txn:create:${user.id}`, RATE_LIMITS.txnCreate);
    await requireTxnPin(user, req, {
      action: "chagans-cc-bill.pay",
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  try {
    // Priced under the RECHARGEKIT_DIRECT scope so this Chagans CC Bill rail
    // reports independently from all other CC payment products and falls back
    // to the SAMEDAY family rate if no dedicated slab is pinned.
    const rate = await getEffectiveRate(
      user.id,
      "BILL_CREDIT_CARD",
      d.amount,
      BBPS_PRICE_SCOPES.RECHARGEKIT_DIRECT
    );

    // Split charge into base + GST for correct revenue accounting.
    // GST-inclusive slabs back-calculate the base.
    const gstInclusive = rate.chargeGstInclusive;
    const gross = withGst(rate.charge, 18);
    const feeMoney = gstInclusive ? dec(rate.charge) : gross.total;
    const baseCharge = gstInclusive
      ? round(dec(rate.charge).div("1.18"))
      : dec(rate.charge);
    const gstMoney = gstInclusive
      ? round(sub(feeMoney, baseCharge))
      : gross.gst;
    const fee = toNumber(feeMoney);

    // Primary consumer identifier for audit — use the first parameter value
    // (typically the consumer/card number).
    const primaryParam = Object.values(d.parameters)[0] ?? "";

    const result = await runTransaction({
      userId: user.id,
      service: "BILL_CREDIT_CARD",
      amount: d.amount,
      fee,
      gst: toNumber(gstMoney),
      vendorCharge: toNumber(rate.vendorCharge),
      priceScope: BBPS_PRICE_SCOPES.RECHARGEKIT_DIRECT,
      commission: toNumber(rate.commission),
      idempotencyKey: d.idempotencyKey,
      // Store last 4 chars of the primary param as the customer identifier
      // (mirrors how other CC rails store card last4 for receipts).
      customer: primaryParam.length >= 4 ? primaryParam.slice(-4) : primaryParam,
      operator: d.billerName,
      partner: "CHAGANS_CC_BILL",
      request: {
        billerId: d.billerId,
        billerName: d.billerName,
        enquiryId: d.enquiryId,
        parameters: d.parameters, // stored for audit/reconciliation only
        amount: d.amount,
        customerPan: d.customerPan || undefined,
      },
      ip: clientIp(req),
      call: () =>
        chagansCcPayBill({
          billerId: d.billerId,
          enquiryId: d.enquiryId,
          amount: d.amount,
          externalRef: d.idempotencyKey,
          customerPan: d.customerPan || undefined,
        }),
    });

    // PROCESSING → 202 (async/pending, do not retry)
    // SUCCESS    → 200
    // FAILED     → 502
    const httpStatus =
      result.status === "SUCCESS"
        ? 200
        : result.status === "PROCESSING" || result.status === "INITIATED"
          ? 202
          : 502;

    return NextResponse.json(result, { status: httpStatus });
  } catch (e) {
    return toErrorResponse(e);
  }
}
