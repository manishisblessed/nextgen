import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";

const Body = z.object({
  billerCode: z.string().min(2),
  category: z.enum(["ELECTRICITY", "WATER", "GAS", "CREDIT_CARD", "EDUCATION", "INSURANCE", "BROADBAND"]),
  customerParams: z.record(z.string()),
  idempotencyKey: z.string().min(8)
});

export async function POST(req: Request) {
  const userId = "demo-user-id";
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const bbps = getPartner("bbps");
  const r = await bbps.fetchBill({ userId, ...parsed.data });
  return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}
