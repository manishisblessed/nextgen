/**
 * Instant wallet top-up via the UPI/PG partner (BulkPe Simple PG, or
 * Razorpay/mock fallback — whatever getPartner("upi") resolves).
 *
 * Lifecycle:
 *   initiateTopup  -> Transaction(WALLET_TOPUP, INITIATED) + provider collect
 *                     (referenceId = our Transaction.refId)
 *   settleTopup    -> verifies status WITH THE PROVIDER (never trusts a
 *                     webhook body), then atomically marks SUCCESS and credits
 *                     the wallet. Idempotent: the ledger credit carries
 *                     idempotencyKey `topup:<txnId>` so webhook + poll + admin
 *                     retry can all race safely.
 */
import { customAlphabet } from "nanoid";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { creditWallet } from "../ledger";
import { assertRealMoneyProvider, getUpiProviderByName, resolveUpiSelection } from "../partners";
// Imported from the submodule (not the partners barrel) so unit tests that mock
// "@/lib/partners" still get the real gateway→scope map.
import { chagansScopeForGateway } from "../partners/chagans-pg";
import type { UpiStatusOutput } from "../partners/types";
import { round } from "../money";
import { emitWebhookEvent } from "../platform/webhooks";
import { sendOpsAlert } from "../monitoring/alerts";
import { logger } from "../logger";
import { isAmountMismatch } from "./guards";
import { assertPushWithinCap, WalletOpError } from "./operations";
import { getEffectiveMdr } from "../mdr/resolver";
import { handleTopupCapture } from "../settlement/pg";

export type TopupState = "INITIATED" | "PROCESSING" | "SUCCESS" | "FAILED" | "HOLD";

/**
 * Providers whose wallet top-ups are priced + settled through the scheme-driven
 * PG acquiring pipeline (net-of-MDR credit + upline commission), exactly like a
 * POS/PG settlement. For these, a top-up is BLOCKED at initiation when the
 * retailer's scheme cannot price a PG slab, and settled net-of-MDR (never a full
 * credit) at the webhook. The provider's `name` doubles as the MDR scopeKey
 * (its PG MdrSlab `company` / RailMdrRate `scopeKey`). Non-listed providers keep
 * the legacy full-credit top-up behaviour.
 */
const PG_MDR_PROVIDERS: ReadonlySet<string> = new Set(["CHAGANS_PG"]);

/** True when a provider's top-ups are priced + settled through the PG MDR
 *  pipeline (net-of-MDR + commission), so the retailer sees an up-front gateway
 *  charge and must have a priceable PG scheme slab. */
export function isPgMdrProvider(name: string | null | undefined): boolean {
  return !!name && PG_MDR_PROVIDERS.has(name);
}

/**
 * The MDR scopeKey a PG-MDR top-up is priced against. Chagans runs TWO gateways
 * (Comet / Star) on one provider name but at different acquiring costs, so each
 * gateway prices against its OWN scope — resolved from the selected gateway id.
 * Non-Chagans PG-MDR providers price against the bare provider name.
 */
export function pgMdrScopeKey(providerName: string, gatewayId?: string | null): string {
  if (providerName === "CHAGANS_PG") return chagansScopeForGateway(gatewayId ?? undefined);
  return providerName;
}

/** Recover the pricing scope for a persisted top-up at settle time. Prefers the
 *  `pgScope` we stored at initiation; falls back to the stored gateway id, then
 *  the bare provider — so the settle scope always matches what init priced. */
function pgScopeForTxn(txn: { partner: string | null; request: Prisma.JsonValue }): string {
  const partner = txn.partner ?? "";
  if (!PG_MDR_PROVIDERS.has(partner)) return partner;
  const req =
    txn.request && typeof txn.request === "object" && !Array.isArray(txn.request)
      ? (txn.request as Record<string, unknown>)
      : {};
  if (typeof req.pgScope === "string" && req.pgScope) return req.pgScope;
  return pgMdrScopeKey(partner, typeof req.gateway === "string" ? req.gateway : undefined);
}

/**
 * refId token alphabet — UPPERCASE A–Z + 0–9 ONLY. This is deliberately NOT the
 * default nanoid alphabet (which includes `_` and `-`): Chagans PG REJECTS
 * txnIds containing underscores / hyphens / special characters (verified live),
 * and we send the refId verbatim as the provider txnId. An alphanumeric-only
 * refId is safe across every PG rail.
 */
const refToken = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 12);

/** Verified payin outcome supplied by a trusted (IP-authenticated) webhook. */
export type VerifiedPayin = {
  status: UpiStatusOutput["status"];
  amount?: number;
  reference?: string;
  /**
   * Instrument the customer paid with (UPI | CARD | NETBANKING | WALLET), from
   * the webhook. Threaded into the PG MDR pricing at settlement; defaults to UPI
   * when the webhook sends no usable method.
   */
  paymentMode?: string;
};

export class TopupError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 400, public code = "TOPUP_ERROR") {
    super(message);
    this.name = "TopupError";
    this.statusCode = statusCode;
  }
}

export async function initiateTopup(input: {
  userId: string;
  amount: number;
  vpa?: string;
  note?: string;
  customerName?: string;
  customerPhone: string;
  customerEmail?: string;
  /** Optional PG gateway channel (`<provider>:<gateway>`); defaults to primary. */
  channel?: string;
  ip?: string;
}): Promise<{ refId: string; orderId: string; paymentUrl?: string; upiIntent?: string; provider: string; amount: number }> {
  // Resolve the user-selected gateway to a concrete provider + collect params.
  // Chagans needs a unique-to-paise amount (prepareAmount) and enforces a
  // per-gateway cap; Viable passes the amount through unchanged.
  const selection = resolveUpiSelection(input.channel);
  const upi = selection.provider;

  // Never open a collect through a mock provider in production — the mock
  // auto-"pays" every request, which would mint wallet balance with no real
  // money behind it. Block the top-up up front until a live PG is configured.
  assertRealMoneyProvider(
    upi,
    () =>
      new TopupError(
        "Wallet top-up is temporarily unavailable. Please try again later.",
        503,
        "PG_NOT_LIVE"
      )
  );

  // Gateway cap guard (e.g. Chagans Comet ₹1,00,000 / Star ₹40,000) — reject
  // locally with a clear message rather than after a provider HTTP 400.
  if (selection.maxAmount && input.amount > selection.maxAmount) {
    throw new TopupError(
      `This gateway supports up to ₹${selection.maxAmount.toLocaleString("en-IN")} per transaction. Choose a lower amount or another gateway.`,
      400,
      "AMOUNT_OVER_LIMIT"
    );
  }

  // The amount actually charged (and later credited). For Chagans this carries
  // random paise so the order is unique; the customer pays — and is credited —
  // this exact value, so there is no financial loss.
  const chargeAmount = Number(round(selection.prepareAmount(input.amount)));

  // Wallet cap gate — refuse the collect up front rather than bouncing money
  // back after the customer has already paid.
  try {
    await assertPushWithinCap(input.userId, "PRIMARY", chargeAmount);
  } catch (e) {
    if (e instanceof WalletOpError) throw new TopupError(e.message, 400, e.code);
    throw e;
  }

  // HARD RULE (money-safety): a PG-MDR top-up is priced exactly like a PG
  // acquiring settlement. If the retailer's assigned scheme cannot price a PG
  // slab for THIS gateway's scope, the top-up is NOT fundable via the gateway —
  // block it HERE, before any order is created, so we never take money we
  // cannot price. Comet and Star price against separate scopes, so a retailer
  // priced on one gateway is correctly blocked on the other until its slab
  // exists. The exact payment mode is unknown at init (the customer picks
  // UPI/card on the hosted page), so this is a mode-agnostic priceability probe;
  // the precise mode is applied when the webhook settles.
  const pgScope = pgMdrScopeKey(upi.name, selection.channel);
  if (PG_MDR_PROVIDERS.has(upi.name)) {
    const priced = await getEffectiveMdr(input.userId, "PG", chargeAmount, {
      company: pgScope,
      settlementType: "T0",
    });
    if (priced.source === "NONE") {
      throw new TopupError(
        "Payment Gateway top-up isn't enabled for your account yet. Contact your admin.",
        403,
        "PG_NO_SCHEME"
      );
    }
  }

  const refId = `TOPUP${refToken()}`;

  const txn = await prisma.transaction.create({
    data: {
      refId,
      userId: input.userId,
      service: "WALLET_TOPUP",
      amount: new Prisma.Decimal(chargeAmount),
      status: "INITIATED",
      customer: input.customerPhone,
      partner: upi.name,
      request: {
        amount: chargeAmount,
        requestedAmount: input.amount,
        vpa: input.vpa ?? null,
        note: input.note ?? null,
        channel: input.channel ?? null,
        gateway: selection.channel ?? null,
        // The MDR pricing scope locked at initiation — the settle path reuses
        // this EXACT scope so a Comet top-up never settles on Star's rate.
        pgScope: PG_MDR_PROVIDERS.has(upi.name) ? pgScope : null,
      } as Prisma.InputJsonValue,
      ipAddress: input.ip,
    },
  });

  const r = await upi.collect({
    userId: input.userId,
    idempotencyKey: refId,
    amount: chargeAmount,
    vpa: input.vpa,
    note: input.note ?? "Wallet top-up",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    channel: selection.channel,
    // Public return page (no auth): payment gateways redirect back cross-site
    // (often via POST), which would bounce /dashboard/wallet to the login wall.
    // Crediting is webhook-driven, so the redirect only needs to land friendly.
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pay/return?ref=${refId}`,
  });

  if (!r.ok) {
    await prisma.transaction.update({
      where: { id: txn.id },
      data: { status: "FAILED", errorCode: r.code, errorMessage: r.message },
    });
    throw new TopupError(r.message, 502, r.code);
  }

  await prisma.transaction.update({
    where: { id: txn.id },
    data: {
      status: "PROCESSING",
      partnerTxnId: r.data.orderId,
      response: {
        paymentUrl: r.data.paymentUrl ?? null,
        upiIntent: r.data.upiIntent ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    refId,
    orderId: r.data.orderId,
    paymentUrl: r.data.paymentUrl,
    upiIntent: r.data.upiIntent,
    provider: upi.name,
    amount: chargeAmount,
  };
}

/**
 * Settle a wallet top-up. Safe to call from the status poll, the PG webhook,
 * and recon — all paths converge on the same idempotent credit.
 *
 * Provider routing: we re-verify through the provider that ORIGINATED the
 * transaction (`txn.partner`), never the default — so a Chagans payin is never
 * checked against Viable.
 *
 * `verified` is supplied ONLY by a trusted, IP-authenticated webhook (e.g.
 * Chagans, which has no status API): it carries the provider-confirmed status +
 * amount and is used in place of a status() pull. When omitted:
 *   - a pull-capable provider (Viable) is polled via status();
 *   - a webhook-only provider (Chagans) cannot be polled, so we simply reflect
 *     the current DB state (the webhook is what credits) — never a status pull.
 */
export async function settleTopup(
  refId: string,
  webhookVerified?: VerifiedPayin
): Promise<{ refId: string; status: TopupState }> {
  const txn = await prisma.transaction.findUnique({ where: { refId } });
  if (!txn || txn.service !== "WALLET_TOPUP") {
    throw new TopupError("Top-up not found", 404, "NOT_FOUND");
  }
  if (txn.status === "SUCCESS") return { refId, status: "SUCCESS" };
  if (txn.status === "FAILED") return { refId, status: "FAILED" };

  // Route through the EXACT provider that created this top-up.
  const upi = getUpiProviderByName(txn.partner);
  // Defence-in-depth: even if a stale INITIATED/PROCESSING top-up exists, never
  // settle (credit the wallet) through a mock provider in production. The mock's
  // status() always reports PAID, so crediting on it would create phantom money.
  assertRealMoneyProvider(
    upi,
    () =>
      new TopupError(
        "Wallet top-up settlement is unavailable. Please contact support.",
        503,
        "PG_NOT_LIVE"
      )
  );

  let r: { ok: true; data: UpiStatusOutput } | { ok: false; code: string; message: string };
  if (webhookVerified) {
    // Trusted webhook supplied the provider-verified outcome — use it verbatim.
    r = { ok: true, data: { status: webhookVerified.status, amount: webhookVerified.amount, reference: webhookVerified.reference } };
  } else if (upi.webhookOnly) {
    // No status API to pull — the webhook is the only crediting path. Reflect
    // current DB state so the client poll / recon can see progress + expire.
    return { refId, status: txn.status === "HOLD" ? "HOLD" : "PROCESSING" };
  } else {
    r = await upi.status(txn.partnerTxnId || refId);
  }
  if (!r.ok) throw new TopupError(r.message, 502, r.code);

  if (r.data.status === "PAID") {
    // MONEY-SAFETY: never credit unless the provider-VERIFIED amount matches
    // what we initiated. A mismatch is anomalous (tamper / double-spend / bug),
    // so we park the payin in HOLD for manual review and alert ops — we NEVER
    // auto-credit a mismatched amount. HOLD rows are ignored by the reconcile
    // sweep, so this alerts at most once.
    const verified = r.data.amount;
    if (isAmountMismatch(verified, Number(txn.amount))) {
      const held = await prisma.transaction.updateMany({
        where: { id: txn.id, status: { in: ["INITIATED", "PROCESSING"] } },
        data: {
          status: "HOLD",
          errorCode: "AMOUNT_MISMATCH",
          errorMessage: `Verified ₹${verified} ≠ initiated ₹${txn.amount}`,
        },
      });
      if (held.count > 0) {
        await prisma.auditLog.create({
          data: {
            userId: txn.userId,
            action: "wallet.topup_amount_mismatch",
            entity: "Transaction",
            entityId: txn.id,
            meta: { refId, initiated: txn.amount.toString(), verified, utr: r.data.reference ?? null },
          },
        });
        await sendOpsAlert({
          title: "Wallet top-up amount mismatch — HELD (not credited)",
          severity: "critical",
          details: { refId, initiated: txn.amount.toString(), verified, provider: txn.partner ?? "" },
          href: "/dashboard/admin/audit",
        });
      }
      return { refId, status: "HOLD" };
    }

    // ── PG-MDR providers (Chagans): settle NET-of-MDR, priced like a PG
    // acquiring capture (company margin + upline commission), credited INSTANT.
    // This REPLACES the legacy full-amount TOPUP credit for these providers — the
    // single money movement is the net credit inside handleTopupCapture.
    if (PG_MDR_PROVIDERS.has(txn.partner ?? "")) {
      const capture = await handleTopupCapture({
        transactionRef: txn.refId,
        orderId: txn.partnerTxnId,
        userId: txn.userId,
        grossAmount: Number(txn.amount),
        paymentMode: webhookVerified?.paymentMode,
        // Per-gateway scope locked at initiation (Comet vs Star price apart).
        scopeKey: pgScopeForTxn(txn),
        capturedAt: new Date(),
      });

      if (capture.status === "NO_SCHEME") {
        // HARD RULE: unpriced money is NEVER credited — HOLD + alert ops.
        const held = await prisma.transaction.updateMany({
          where: { id: txn.id, status: { in: ["INITIATED", "PROCESSING"] } },
          data: {
            status: "HOLD",
            errorCode: "PG_NO_SCHEME",
            errorMessage: `No PG scheme slab to price this top-up (₹${txn.amount})`,
          },
        });
        if (held.count > 0) {
          await prisma.auditLog.create({
            data: {
              userId: txn.userId,
              action: "wallet.topup_held_no_scheme",
              entity: "Transaction",
              entityId: txn.id,
              meta: { refId, amount: txn.amount.toString(), provider: txn.partner },
            },
          });
          await sendOpsAlert({
            title: "Wallet top-up not priceable — HELD (not credited)",
            severity: "critical",
            details: { refId, amount: txn.amount.toString(), provider: txn.partner ?? "" },
            href: "/dashboard/admin/audit",
          });
        }
        return { refId, status: "HOLD" };
      }

      if (capture.status === "SETTLED" || capture.status === "DUPLICATE") {
        const utr = webhookVerified?.reference ?? null;
        // The net credit already committed inside handleTopupCapture; now flip
        // the initiating TOPUP record to SUCCESS (idempotent; no second credit).
        await prisma.transaction.updateMany({
          where: { id: txn.id, status: { in: ["INITIATED", "PROCESSING", "HOLD"] } },
          data: {
            status: "SUCCESS",
            response: {
              utr,
              verifiedAmount: verified ?? null,
              net: capture.netAmount ?? null,
              mdr: capture.mdrAmount ?? null,
              settledAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        await prisma.auditLog.create({
          data: {
            userId: txn.userId,
            action: "wallet.topup_credited",
            entity: "Transaction",
            entityId: txn.id,
            meta: {
              refId,
              gross: txn.amount.toString(),
              net: capture.netAmount ?? null,
              mdr: capture.mdrAmount ?? null,
              provider: txn.partner,
              utr,
            },
          },
        });
        logger.info({
          action: "wallet.topup_settled",
          refId,
          topupId: txn.partnerTxnId,
          amount: Number(txn.amount),
          net: capture.netAmount ?? null,
          mdr: capture.mdrAmount ?? null,
          utr,
          provider: txn.partner,
        });
        void emitWebhookEvent(txn.userId, "topup.credited", {
          refId,
          amount: capture.netAmount ?? Number(txn.amount),
          gross: Number(txn.amount),
          provider: txn.partner,
          utr,
        });
        return { refId, status: "SUCCESS" };
      }

      // QUEUED (parked — credit failed transiently) / SKIPPED — leave the TOPUP
      // PROCESSING; the instant safety-net cron finishes a parked credit and
      // flips it to SUCCESS. Never credit the full amount here.
      return { refId, status: "PROCESSING" };
    }

    const utr = r.data.reference ?? null;
    await prisma.$transaction(async (tx) => {
      // Claim the terminal state first so concurrent settlers do nothing.
      const claimed = await tx.transaction.updateMany({
        where: { id: txn.id, status: { in: ["INITIATED", "PROCESSING"] } },
        data: {
          status: "SUCCESS",
          response: { utr, verifiedAmount: verified ?? null, settledAt: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) return;
      await creditWallet(
        {
          userId: txn.userId,
          amount: txn.amount,
          reason: "TOPUP",
          refType: "Transaction",
          refId: txn.id,
          note: `Wallet top-up ${refId}`,
          idempotencyKey: `topup:${txn.id}`,
        },
        tx
      );
      await tx.auditLog.create({
        data: {
          userId: txn.userId,
          action: "wallet.topup_credited",
          entity: "Transaction",
          entityId: txn.id,
          meta: { refId, amount: txn.amount.toString(), provider: txn.partner, utr },
        },
      });
    });
    // Structured settle log for support/reconciliation lookups.
    logger.info({
      action: "wallet.topup_settled",
      refId,
      topupId: txn.partnerTxnId,
      amount: Number(txn.amount),
      utr,
      provider: txn.partner,
    });
    // NOTE: wallet top-ups are intentionally NOT mirrored into the company payin
    // monitor — a top-up is an agent loading their own wallet (a liability), not
    // company acquiring business. The payin wallet tracks POS / PG / QR only.

    // Partner webhook (best-effort; never blocks or fails the credit).
    void emitWebhookEvent(txn.userId, "topup.credited", {
      refId,
      amount: Number(txn.amount),
      provider: txn.partner,
      utr,
    });
    return { refId, status: "SUCCESS" };
  }

  if (r.data.status === "FAILED" || r.data.status === "EXPIRED") {
    await prisma.transaction.updateMany({
      where: { id: txn.id, status: { in: ["INITIATED", "PROCESSING"] } },
      data: { status: "FAILED", errorCode: r.data.status },
    });
    return { refId, status: "FAILED" };
  }

  return { refId, status: "PROCESSING" };
}
