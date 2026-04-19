import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

const Body = z.object({
  channel: z.enum(["SMS", "EMAIL"]).default("SMS"),
  target: z.string().min(5),
  purpose: z.enum(["LOGIN", "REGISTER", "RESET", "TXN"]).default("LOGIN")
});

function generate6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const otp = generate6();
  const codeHash = sha256(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.otp.create({
    data: { channel: parsed.data.channel, target: parsed.data.target, codeHash, purpose: parsed.data.purpose, expiresAt }
  });

  if (parsed.data.channel === "SMS") {
    const sms = getPartner("sms");
    const r = await sms.sendOtp({ phone: parsed.data.target, otp });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: 502 });
  } else {
    const email = getPartner("email");
    const r = await email.send({
      to: parsed.data.target,
      subject: "Your Payprism OTP",
      html: `<p>Your OTP is <strong>${otp}</strong>. Valid for 5 minutes.</p>`
    });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, expiresAt });
}
