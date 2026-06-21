import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const PatchBody = z.object({
  action: z.enum(["approve", "reject"]),
  remarks: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const fundReq = await prisma.fundRequest.findUnique({
    where: { id: params.id },
    include: { requester: { select: { id: true, parentId: true, name: true } } },
  });

  if (!fundReq)
    return NextResponse.json({ error: "Fund request not found" }, { status: 404 });

  if (fundReq.status !== "PENDING")
    return NextResponse.json({ error: "Request already processed" }, { status: 409 });

  const isAdmin = user.role === "ADMIN" || user.role === "SUPPORT";
  const isParent = fundReq.requester.parentId === user.id;
  if (!isAdmin && !isParent)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (parsed.data.action === "reject") {
    await prisma.fundRequest.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        approverId: user.id,
        rejectedAt: new Date(),
        remarks: parsed.data.remarks ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "fund_request.rejected",
        entity: "FundRequest",
        entityId: params.id,
        meta: {
          amount: Number(fundReq.amount),
          requesterId: fundReq.requesterId,
        },
      },
    });

    return NextResponse.json({ status: "REJECTED" });
  }

  // Approve: atomic wallet transfer (approver → requester)
  try {
    await prisma.$transaction(async (tx) => {
      const approver = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const amount = Number(fundReq.amount);

      if (Number(approver.walletBalance) < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const approverAfter = Number(approver.walletBalance) - amount;
      await tx.user.update({
        where: { id: user.id },
        data: { walletBalance: approverAfter },
      });
      await tx.walletTxn.create({
        data: {
          userId: user.id,
          direction: "DEBIT",
          reason: "FUND_TRANSFER_OUT",
          amount: new Prisma.Decimal(amount),
          balanceAfter: new Prisma.Decimal(approverAfter),
          refType: "FundRequest",
          refId: params.id,
          note: `Fund transfer to ${fundReq.requester.name}`,
        },
      });

      const requester = await tx.user.findUniqueOrThrow({
        where: { id: fundReq.requesterId },
      });
      const requesterAfter = Number(requester.walletBalance) + amount;
      await tx.user.update({
        where: { id: fundReq.requesterId },
        data: { walletBalance: requesterAfter },
      });
      await tx.walletTxn.create({
        data: {
          userId: fundReq.requesterId,
          direction: "CREDIT",
          reason: "FUND_TRANSFER_IN",
          amount: new Prisma.Decimal(amount),
          balanceAfter: new Prisma.Decimal(requesterAfter),
          refType: "FundRequest",
          refId: params.id,
          note: `Fund request approved by ${user.name}`,
        },
      });

      await tx.fundRequest.update({
        where: { id: params.id },
        data: {
          status: "APPROVED",
          approverId: user.id,
          approvedAt: new Date(),
          remarks: parsed.data.remarks ?? null,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { error: "Insufficient wallet balance to approve this request" },
        { status: 400 }
      );
    }
    throw e;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "fund_request.approved",
      entity: "FundRequest",
      entityId: params.id,
      meta: {
        amount: Number(fundReq.amount),
        requesterId: fundReq.requesterId,
      },
    },
  });

  return NextResponse.json({ status: "APPROVED" });
}
