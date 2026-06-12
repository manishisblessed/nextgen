import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email = "demo@jmpnextgenpay.com" } = body;

  await new Promise((r) => setTimeout(r, 400));

  return NextResponse.json({
    ok: true,
    user: {
      name: "Aman Sharma",
      email,
      role: "retailer",
      walletBalance: 28450
    },
    token: "demo-jwt-" + Math.random().toString(36).slice(2)
  });
}
