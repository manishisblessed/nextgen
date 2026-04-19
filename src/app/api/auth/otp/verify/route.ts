import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

const Body = z.object({
  target: z.string().min(5),
  purpose: z.enum(["LOGIN", "REGISTER", "RESET", "TXN"]).default("LOGIN"),
  code: z.string().length(6)
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const otp = await prisma.otp.findFirst({
    where: { target: parsed.data.target, purpose: parsed.data.purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }
  });

  if (!otp) return NextResponse.json({ error: "OTP expired or not found" }, { status: 400 });
  if (otp.attempts >= 5) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  if (otp.codeHash !== sha256(parsed.data.code)) {
    await prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { consumed: true } });
  return NextResponse.json({ ok: true });
}
