import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { deriveTxnRefs } from "@/lib/recon/refs";
import { toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** GET /api/admin/transactions/needs-review?page=1 */
export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = 25;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { status: "NEEDS_REVIEW" },
        orderBy: { createdAt: "asc" },
        take: pageSize,
        skip,
        select: {
          id: true,
          refId: true,
          userId: true,
          status: true,
          service: true,
          partner: true,
          partnerTxnId: true,
          amount: true,
          fee: true,
          operator: true,
          customer: true,
          request: true,
          response: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
          refundEligibleAt: true,
          user: { select: { phone: true, userCode: true } },
        },
      }),
      prisma.transaction.count({ where: { status: "NEEDS_REVIEW" } }),
    ]);

    const exposure = await prisma.transaction.aggregate({
      where: { status: "NEEDS_REVIEW" },
      _sum: { amount: true },
    });

    const items = rows.map((r) => {
      const { request, response, ...rest } = r;
      return {
        ...rest,
        amount: toNumber(r.amount),
        fee: toNumber(r.fee),
        refs: deriveTxnRefs({ partnerTxnId: r.partnerTxnId, request, response }),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      exposure: toNumber(exposure._sum?.amount ?? 0),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
