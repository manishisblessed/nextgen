import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  mode: z.enum(["IMPS", "NEFT", "RTGS"]),
  beneficiary: z.object({
    name: z.string().min(2),
    accountNumber: z.string().min(6),
    ifsc: z.string().length(11),
    mobile: z.string().optional()
  }),
  amount: z.number().positive().max(500000),
  remitterMobile: z.string().min(10),
  purpose: z.string().optional(),
  idempotencyKey: z.string().min(8)
});

export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
  const userId = user.id;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const dmt = getPartner("dmt");
  const fee = parsed.data.mode === "RTGS" ? 12 : parsed.data.mode === "NEFT" ? 6 : 5;

  const result = await runTransaction({
    userId,
    service: parsed.data.mode === "IMPS" ? "DMT_IMPS" : parsed.data.mode === "NEFT" ? "DMT_NEFT" : "DMT_RTGS",
    amount: parsed.data.amount,
    fee,
    commission: Math.min(25, parsed.data.amount * 0.004),
    idempotencyKey: parsed.data.idempotencyKey,
    customer: parsed.data.beneficiary.accountNumber.slice(-4),
    operator: parsed.data.beneficiary.ifsc.slice(0, 4),
    partner: dmt.name,
    request: parsed.data,
    call: () => dmt.transfer({ userId, ...parsed.data })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
