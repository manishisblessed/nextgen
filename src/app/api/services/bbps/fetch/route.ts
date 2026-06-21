import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  billerCode: z.string().min(2),
  category: z.enum(["ELECTRICITY", "WATER", "GAS", "CREDIT_CARD", "EDUCATION", "INSURANCE", "BROADBAND"]),
  customerParams: z.record(z.string()),
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

  const bbps = getPartner("bbps");
  const r = await bbps.fetchBill({ userId: user.id, ...parsed.data });
  return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}
