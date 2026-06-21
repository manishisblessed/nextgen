import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  amount: z.number().positive().max(100000),
  vpa: z.string().optional(),
  note: z.string().max(80).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().min(10),
  idempotencyKey: z.string().min(8)
});

export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const upi = getPartner("upi");
  const r = await upi.collect({
    userId: user.id,
    idempotencyKey: parsed.data.idempotencyKey,
    amount: parsed.data.amount,
    vpa: parsed.data.vpa,
    note: parsed.data.note,
    customerEmail: parsed.data.customerEmail,
    customerPhone: parsed.data.customerPhone,
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/upi/callback`
  });

  return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}
