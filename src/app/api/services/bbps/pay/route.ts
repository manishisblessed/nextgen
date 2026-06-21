import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  billerCode: z.string().min(2),
  category: z.enum(["ELECTRICITY", "WATER", "GAS", "CREDIT_CARD", "EDUCATION", "INSURANCE", "BROADBAND"]),
  customerParams: z.record(z.string()),
  amount: z.number().positive().max(500000),
  idempotencyKey: z.string().min(8)
});

const SERVICE = {
  ELECTRICITY: "BILL_ELECTRICITY",
  WATER: "BILL_WATER",
  GAS: "BILL_GAS",
  CREDIT_CARD: "BILL_CREDIT_CARD",
  EDUCATION: "BILL_EDUCATION",
  INSURANCE: "BILL_INSURANCE",
  BROADBAND: "RECHARGE_BROADBAND"
} as const;

export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const bbps = getPartner("bbps");
  const result = await runTransaction({
    userId: user.id,
    service: SERVICE[parsed.data.category],
    amount: parsed.data.amount,
    fee: 0,
    commission: Math.min(15, parsed.data.amount * 0.008),
    idempotencyKey: parsed.data.idempotencyKey,
    customer: Object.values(parsed.data.customerParams)[0],
    operator: parsed.data.billerCode,
    partner: bbps.name,
    request: parsed.data,
    call: () => bbps.pay({ userId: user.id, ...parsed.data })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
