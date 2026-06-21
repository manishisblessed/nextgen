import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  type: z.enum(["MOBILE", "DTH", "BROADBAND"]),
  operatorCode: z.string().min(2),
  number: z.string().min(6),
  amount: z.number().positive().max(10000),
  circle: z.string().optional(),
  idempotencyKey: z.string().min(8)
});

const SERVICE = { MOBILE: "RECHARGE_MOBILE", DTH: "RECHARGE_DTH", BROADBAND: "RECHARGE_BROADBAND" } as const;

export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const partner = getPartner("recharge");
  const result = await runTransaction({
    userId: user.id,
    service: SERVICE[parsed.data.type],
    amount: parsed.data.amount,
    commission: parsed.data.amount * 0.03,
    idempotencyKey: parsed.data.idempotencyKey,
    customer: parsed.data.number,
    operator: parsed.data.operatorCode,
    partner: partner.name,
    request: parsed.data,
    call: () => partner.recharge({ userId: user.id, ...parsed.data })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
