import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const CreateBody = z.object({
  amount: z.number().positive().max(500000),
  mode: z.string().min(2),
  utr: z.string().optional(),
  bankName: z.string().optional(),
});

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  let where: Record<string, unknown>;
  if (user.role === "ADMIN" || user.role === "SUPPORT") {
    where = {};
  } else if (user.role === "RETAILER") {
    where = { requesterId: user.id };
  } else {
    where = {
      OR: [
        { requesterId: user.id },
        { requester: { parentId: user.id } },
      ],
    };
  }

  const requests = await prisma.fundRequest.findMany({
    where,
    include: {
      requester: {
        select: { id: true, name: true, email: true, phone: true },
      },
      approver: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      mode: r.mode,
      utr: r.utr,
      bankName: r.bankName,
      status: r.status,
      remarks: r.remarks,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rejectedAt: r.rejectedAt?.toISOString() ?? null,
      requester: r.requester,
      approver: r.approver,
    })),
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const requester = await prisma.user.findUnique({
    where: { id: user.id },
    select: { parentId: true },
  });

  const created = await prisma.fundRequest.create({
    data: {
      requesterId: user.id,
      approverId: requester?.parentId ?? null,
      amount: parsed.data.amount,
      mode: parsed.data.mode,
      utr: parsed.data.utr ?? null,
      bankName: parsed.data.bankName ?? null,
    },
    include: {
      requester: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  });

  return NextResponse.json(
    {
      request: {
        id: created.id,
        amount: Number(created.amount),
        mode: created.mode,
        utr: created.utr,
        bankName: created.bankName,
        status: created.status,
        remarks: created.remarks,
        createdAt: created.createdAt.toISOString(),
        approvedAt: null,
        rejectedAt: null,
        requester: created.requester,
        approver: null,
      },
    },
    { status: 201 }
  );
}
