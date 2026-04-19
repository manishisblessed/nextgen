import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";

const Body = z.object({
  aadhaar: z.string().min(12).max(14),
  bankIin: z.string().min(3),
  amount: z.number().positive().max(10000),
  biometric: z.object({ type: z.enum(["FMR", "FIR"]), data: z.string().min(8) }),
  idempotencyKey: z.string().min(8)
});

export async function POST(req: Request) {
  // TODO: replace with real session
  const userId = "demo-user-id";

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const aeps = getPartner("aeps");
  const result = await runTransaction({
    userId,
    service: "AEPS_WITHDRAW",
    amount: parsed.data.amount,
    fee: 0,
    commission: Math.min(12, parsed.data.amount * 0.005),
    idempotencyKey: parsed.data.idempotencyKey,
    customer: parsed.data.aadhaar.slice(-4),
    operator: parsed.data.bankIin,
    partner: aeps.name,
    request: parsed.data,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    call: () =>
      aeps.withdraw({
        userId,
        idempotencyKey: parsed.data.idempotencyKey,
        aadhaar: parsed.data.aadhaar,
        bankIin: parsed.data.bankIin,
        amount: parsed.data.amount,
        biometric: parsed.data.biometric
      })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
