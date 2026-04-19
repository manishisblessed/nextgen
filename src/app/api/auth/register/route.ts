import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, 600));

  return NextResponse.json({
    ok: true,
    user: {
      name: body.name ?? "New User",
      email: body.email,
      phone: body.phone,
      role: body.role ?? "agent",
      walletBalance: 0
    },
    token: "demo-jwt-" + Math.random().toString(36).slice(2)
  });
}
