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

/**
 * POST /api/services/bbps/status
 *
 * Poll the terminal state of a BBPS bill payment. Uses the partner
 * transactionId (stored as partnerTxnId on the Transaction row).
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
    select: { id: true, refId: true, status: true, partnerTxnId: true, partner: true },
  });

  if (!txn) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

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

  return NextResponse.json({
    refId: txn.refId,
    status: txn.status,
    providerStatus: r.data.status,
    operatorRef: r.data.operatorRef,
  });
}
