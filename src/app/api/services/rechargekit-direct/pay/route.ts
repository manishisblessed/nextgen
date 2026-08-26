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
import { rechargekitDirectPay } from "@/lib/partners/rechargekit-direct";
import { AuthError } from "@/lib/auth-server";

const Body = z
  .object({
    mobileNo: z.string().regex(/^\d{10}$/, "Mobile must be exactly 10 digits"),
    accountNo: z
      .string()
      .regex(/^\d{13,19}$/, "Card number must be 13-19 digits"),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "A valid bank IFSC is required (e.g. ICIC0001234)"),
    bankName: z.string().min(2),
    beneficiaryName: z.string().min(2),
    amount: z.number().positive().max(500000),
    transferType: z.enum(["5", "6"]), // 5 = IMPS, 6 = NEFT
    operatorCode: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .refine((v) => v.length > 0, "operatorCode is required"),
    idempotencyKey: z.string().min(8),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * POST /api/services/rechargekit-direct/pay
 *
 * Initiates a credit card payment via the DIRECT RechargeKit API (Offline CC
 * Bill Payment). Wrapped by runTransaction for idempotency, ledger atomicity,
 * and auto-refund on failure.
 *
 * CRITICAL: on timeout/network error, callers MUST NOT blind-retry this
 * endpoint — the provider may have already debited. The transaction is left
 * PROCESSING for reconciliation.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError("Offline CC Bill Payment is available for retailers only", 403);
    await assertServiceEnabled(SERVICE_KEYS.RECHARGEKIT_DIRECT, {
      name: "Offline CC Bill Payment",
      userId: user.id,
      role: user.role,
    });
    await assertLivenessReady(user);
    await enforceRateLimit(`txn:create:${user.id}`, RATE_LIMITS.txnCreate);
    await requireTxnPin(user, req, {
      action: "rechargekit-direct.pay",
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
    // Priced under its own product scope ("rechargekit_direct") so the direct
    // RechargeKit rail is reported/priced independently from the Same Day rails.
    const rate = await getEffectiveRate(
      user.id,
      "BILL_CREDIT_CARD",
      d.amount,
      BBPS_PRICE_SCOPES.RECHARGEKIT_DIRECT
    );
    // Split the customer charge into base + GST so revenue excludes the GST
    // pass-through (mirrors rechargekit/pay). GST-inclusive slabs back-calculate.
    const gstInclusive = rate.chargeGstInclusive;
    const gross = withGst(rate.charge, 18);
    const feeMoney = gstInclusive ? dec(rate.charge) : gross.total;
    const baseCharge = gstInclusive ? round(dec(rate.charge).div("1.18")) : dec(rate.charge);
    const gstMoney = gstInclusive ? round(sub(feeMoney, baseCharge)) : gross.gst;
    const fee = toNumber(feeMoney);

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
      customer: d.accountNo.slice(-4),
      operator: d.bankName,
      partner: "RECHARGEKIT_DIRECT",
      request: {
        mobileNo: d.mobileNo,
        cardLast4: d.accountNo.slice(-4),
        ifsc: d.ifsc,
        bankName: d.bankName,
        beneficiaryName: d.beneficiaryName,
        amount: d.amount,
        transferType: d.transferType,
        operatorCode: d.operatorCode,
      },
      ip: clientIp(req),
      call: () =>
        rechargekitDirectPay({
          mobileNo: d.mobileNo,
          accountNo: d.accountNo,
          ifsc: d.ifsc,
          bankName: d.bankName,
          beneficiaryName: d.beneficiaryName,
          amount: d.amount,
          transferType: d.transferType,
          operatorCode: d.operatorCode,
          partnerRequestId: d.idempotencyKey,
        }),
    });

    // PROCESSING/INITIATED are async-pending (accepted, provider not yet terminal)
    // → 202 Accepted, never 502. Only a genuine FAILED is an upstream error.
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
