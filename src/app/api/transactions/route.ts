import { NextResponse } from "next/server";
import { recentTransactions } from "@/lib/data";

export async function GET() {
  return NextResponse.json({ ok: true, data: recentTransactions });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, 500));

  const refId =
    "TXN" +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase();

  return NextResponse.json({
    ok: true,
    refId,
    service: body.service ?? "Generic",
    amount: body.amount ?? 0,
    status: "Success",
    timestamp: new Date().toISOString()
  });
}
