import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/platform/apiKeys";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { toNumber } from "@/lib/money";

/**
 * Partner API v1 — GET /api/v1/payouts/{id}
 * Scope: payout.read
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireApiKey(req, ["payout.read"]);

    const r = await prisma.payoutRequest.findUnique({ where: { id: params.id } });
    if (!r || r.userId !== user.id) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Payout not found" } }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: r.id,
        mode: r.mode,
        beneficiaryName: r.beneficiaryName,
        accountLast4: r.accountLast4,
        amount: toNumber(r.amount),
        serviceCharge: toNumber(r.serviceCharge),
        gst: toNumber(r.gst),
        totalDebit: toNumber(r.totalDebit),
        status: r.status,
        utr: r.utr,
        failureReason: r.failureReason,
        createdAt: r.createdAt.toISOString(),
        approvedAt: r.approvedAt?.toISOString() ?? null,
        completedAt: r.completedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
