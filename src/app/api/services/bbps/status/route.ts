import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { AuthError } from "@/lib/auth-server";
import { creditWallet } from "@/lib/ledger";
import { round, add } from "@/lib/money";
import { sendOpsAlert } from "@/lib/monitoring/alerts";
import { emitWebhookEvent } from "@/lib/platform/webhooks";
import type { Prisma } from "@prisma/client";

/**
 * POST /api/services/bbps/status
 *
 * Poll the terminal state of a BBPS bill payment. Uses the partner
 * transactionId (stored as partnerTxnId on the Transaction row).
 *
 * When a PROCESSING transaction has reached a terminal state at the provider,
 * this endpoint settles it immediately (SUCCESS → commit, FAILED/REFUNDED →
 * refund wallet) rather than waiting for the next recon sweep. This prevents
 * the "wrong status shown to retailer" problem and reduces the window in which
 * a SameDay timeout-induced FAILED record stays un-recovered.
 */

const Body = z.object({
  refId: z.string().min(3),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (user.role !== "RETAILER") throw new AuthError("BBPS is available for retailers only", 403);
    await assertServiceEnabled(SERVICE_KEYS.BBPS, { name: "Bill Payments", userId: user.id, role: user.role });
    await enforceRateLimit(`bbps:status:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const txn = await prisma.transaction.findFirst({
    where: {
      refId: parsed.data.refId,
      userId: user.id,
      service: {
        in: [
          "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
          "BILL_CREDIT_CARD", "BILL_EDUCATION", "BILL_INSURANCE",
          "RECHARGE_BROADBAND",
        ],
      },
    },
    select: {
      id: true,
      refId: true,
      status: true,
      partnerTxnId: true,
      partner: true,
      amount: true,
      fee: true,
      userId: true,
      service: true,
    },
  });

  if (!txn) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  // Already terminal — just return the stored status.
  if (txn.status === "SUCCESS" || txn.status === "FAILED" || txn.status === "REFUNDED") {
    return NextResponse.json({ refId: txn.refId, status: txn.status });
  }

  if (!txn.partnerTxnId) {
    return NextResponse.json({ refId: txn.refId, status: txn.status, message: "Awaiting partner confirmation" });
  }

  const bbps = getPartner("bbps");
  if (!bbps.status) {
    return NextResponse.json({ refId: txn.refId, status: txn.status, message: "Status polling not available" });
  }

  const r = await bbps.status({ orderId: txn.partnerTxnId });
  if (!r.ok) {
    return NextResponse.json({ refId: txn.refId, status: txn.status, message: "Could not fetch status from provider" });
  }

  const providerStatus = r.data.status;

  // Still genuinely pending at provider — keep PROCESSING.
  if (providerStatus === "PENDING") {
    return NextResponse.json({ refId: txn.refId, status: "PROCESSING", providerStatus: "PENDING" });
  }

  // ---------- Settle the PROCESSING transaction immediately ----------
  // Use updateMany with a status guard so concurrent calls (or a racing recon
  // sweep) are safe — only the first writer transitions the row; subsequent
  // attempts see count=0 and skip the wallet op.

  if (providerStatus === "SUCCESS") {
    const updated = await prisma.transaction.updateMany({
      where: { id: txn.id, status: "PROCESSING" },
      data: {
        status: "SUCCESS",
        response: {
          statusPollSettled: true,
          providerStatus,
          operatorRef: r.data.operatorRef ?? null,
          samedayCharge: r.data.charge ?? null,
          samedayAmount: r.data.amount ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    if (updated.count > 0) {
      await prisma.auditLog.create({
        data: {
          userId: txn.userId,
          action: "bbps.status_poll_settled",
          entity: "Transaction",
          entityId: txn.id,
          meta: { refId: txn.refId, providerStatus, operatorRef: r.data.operatorRef ?? null },
        },
      }).catch(() => {});
      void emitWebhookEvent(txn.userId, "txn.success", {
        refId: txn.refId,
        service: txn.service,
        amount: txn.amount.toNumber(),
      });
    }

    return NextResponse.json({ refId: txn.refId, status: "SUCCESS", operatorRef: r.data.operatorRef });
  }

  // FAILED or REFUNDED — reverse the reserved funds.
  const reserveAmount = round(add(txn.amount.toNumber(), txn.fee.toNumber()));
  // Canonical reversal key shared with the recon sweep so a concurrent run
  // only ever issues one credit (idempotent WalletTxn).
  const reversalKey = `txn:${txn.userId}:${txn.refId}:reversal:recon`;
  const finalStatus = providerStatus === "REFUNDED" ? "REFUNDED" : "FAILED";

  // Wrap updateMany + creditWallet atomically: if the status update commits
  // the wallet credit MUST also commit, or the user's funds stay frozen.
  const refundCount = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.updateMany({
      where: { id: txn.id, status: "PROCESSING" },
      data: {
        status: finalStatus,
        errorCode: "BBPS_PROVIDER_FAILED",
        errorMessage: `Provider reported ${providerStatus} (status poll)`,
        response: {
          statusPollSettled: true,
          providerStatus,
          samedayCharge: r.data.charge ?? null,
          samedayAmount: r.data.amount ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    if (updated.count === 0) return 0;
    await creditWallet(
      {
        userId: txn.userId,
        amount: reserveAmount,
        reason: "REVERSAL",
        refType: "Transaction",
        refId: txn.id,
        idempotencyKey: reversalKey,
      },
      tx
    );
    await tx.auditLog.create({
      data: {
        userId: txn.userId,
        action: "bbps.status_poll_refunded",
        entity: "Transaction",
        entityId: txn.id,
        meta: { refId: txn.refId, providerStatus },
      },
    });
    return updated.count;
  });

  if (refundCount > 0) {
    void emitWebhookEvent(txn.userId, "txn.failed", {
      refId: txn.refId,
      service: txn.service,
      amount: txn.amount.toNumber(),
      code: "BBPS_PROVIDER_FAILED",
      message: `Bill payment ${finalStatus.toLowerCase()} by provider`,
    });

    // Alert ops if SameDay already charged our wallet despite a FAILED status.
    // This is the main source of financial loss (network timeout after debit).
    if (r.data.charge && r.data.charge > 0) {
      void sendOpsAlert({
        title: "⚠️ BBPS payment failed AFTER SameDay wallet debit",
        severity: "critical",
        details: {
          refId: txn.refId,
          userId: txn.userId,
          amount: txn.amount.toNumber(),
          samedayCharge: r.data.charge,
          providerStatus,
          hint: "Check SameDay portal — wallet may have been debited. Manually reconcile.",
        },
      });
    }
  }

  return NextResponse.json({ refId: txn.refId, status: finalStatus });
}
