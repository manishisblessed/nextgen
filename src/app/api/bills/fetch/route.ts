import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, 500));

  return NextResponse.json({
    ok: true,
    biller: body.biller ?? "Unknown",
    consumer: body.consumer ?? "",
    name: "Customer " + (body.consumer ?? "0000").toString().slice(-4),
    due: Math.floor(Math.random() * 4500 + 350),
    dueDate: "30 Apr 2026",
    status: "Unpaid"
  });
}
