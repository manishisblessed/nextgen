import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/platform/apiKeys";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { toNumber } from "@/lib/money";

/**
 * Partner API v1 — GET /api/v1/transactions/{refId}
 * Scope: txn.read
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { refId: string } }) {
  try {
    const { user } = await requireApiKey(req, ["txn.read"]);

    const t = await prisma.transaction.findUnique({ where: { refId: params.refId } });
    if (!t || t.userId !== user.id) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Transaction not found" } }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        refId: t.refId,
        service: t.service,
        status: t.status,
        amount: toNumber(t.amount),
        fee: toNumber(t.fee),
        commission: toNumber(t.commission),
        customer: t.customer,
        operator: t.operator,
        partnerTxnId: t.partnerTxnId,
        errorCode: t.errorCode,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
