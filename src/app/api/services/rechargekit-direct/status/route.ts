import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { chagansCcCheckStatus } from "@/lib/partners/chagans-cc-bill";
import { AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

/**
 * POST /api/services/rechargekit-direct/status
 *
 * Manual transaction status check for Chagans CC Bill payments.
 * Used by:
 *   - Admin panel "Verify with provider" button
 *   - Ops troubleshooting
 *   - Live testing before going production
 *
 * Body: { orderId: string }   — the Chagans transactionId (partnerTxnId)
 *   OR  { refId: string }     — our internal transaction refId (looked up)
 *
 * Auth: Logged-in user (no TXN PIN needed — read-only query)
 * Rate limit: Standard service-level
 */
const Body = z
  .object({
    orderId: z.string().min(1).optional(),
    refId: z.string().min(1).optional(),
  })
  .refine((d) => d.orderId || d.refId, {
    message: "Either orderId (Chagans txnId) or refId (our txnId) is required",
  });

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.RECHARGEKIT_DIRECT, {
      name: "Offline CC Bill Payment",
      userId: session.userId,
    });
    await enforceRateLimit(
      `cc-status:${session.userId}`,
      RATE_LIMITS.SERVICE_READ
    );

    const body = Body.parse(await req.json());

    let orderId = body.orderId;

    // If caller passed our refId, look up the partnerTxnId from the database
    if (!orderId && body.refId) {
      const txn = await prisma.transaction.findFirst({
        where: {
          refId: body.refId,
          userId: session.userId,
          partner: "CHAGANS_CC_BILL",
        },
        select: { partnerTxnId: true },
      });
      if (!txn?.partnerTxnId) {
        return NextResponse.json(
          {
            ok: false,
            code: "NOT_FOUND",
            message:
              "No Chagans CC Bill transaction found for this refId, or it has no provider transaction ID yet",
          },
          { status: 404 }
        );
      }
      orderId = txn.partnerTxnId;
    }

    const result = await chagansCcCheckStatus(orderId!);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code ?? "PROVIDER_ERROR",
          message: result.message ?? "Status check failed",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        orderId: result.data.orderId,
        status: result.data.status,
        amount: result.data.amount ?? null,
        message: result.data.message ?? null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { ok: false, code: "AUTH_ERROR", message: err.message },
        { status: 401 }
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: err.errors.map((e) => e.message).join("; "),
        },
        { status: 400 }
      );
    }
    return toErrorResponse(err);
  }
}
