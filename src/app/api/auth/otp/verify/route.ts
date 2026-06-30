import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { clientIp, logSecurityEvent } from "@/lib/security/audit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { isTwilioOtpEnabled, checkVerification } from "@/lib/partners/twilio";

const Body = z.object({
  channel: z.enum(["SMS", "EMAIL"]).default("SMS"),
  target: z.string().min(5),
  purpose: z.enum(["LOGIN", "REGISTER", "RESET", "TXN"]).default("LOGIN"),
  code: z.string().length(6)
});

function maskTarget(target: string): string {
  if (target.includes("@")) {
    const [name, domain] = target.split("@");
    return `${name.slice(0, 2)}***@${domain ?? ""}`;
  }
  return target.length > 4 ? `***${target.slice(-4)}` : "***";
}

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await enforceRateLimit(`otp:verify:${parsed.data.target.toLowerCase()}`, RATE_LIMITS.otp);
    await enforceRateLimit(`otp:verify:ip:${ip}`, RATE_LIMITS.otpIp);
  } catch (e) {
    return toErrorResponse(e);
  }

  // Twilio Verify handles SMS verification end-to-end
  if ((parsed.data.channel === "SMS") && isTwilioOtpEnabled()) {
    const phone = parsed.data.target.startsWith("+")
      ? parsed.data.target
      : `+91${parsed.data.target.replace(/\D/g, "").slice(-10)}`;

    const r = await checkVerification({ to: phone, code: parsed.data.code });

    if (r.ok) {
      await logSecurityEvent({
        action: "auth.otp_verified",
        entity: "Otp",
        ip,
        userAgent: req.headers.get("user-agent"),
        meta: { purpose: parsed.data.purpose, target: maskTarget(parsed.data.target), provider: "twilio" },
      });
      return NextResponse.json({ ok: true });
    }

    await logSecurityEvent({
      action: "auth.otp_failed",
      severity: "warn",
      entity: "Otp",
      ip,
      userAgent: req.headers.get("user-agent"),
      meta: { purpose: parsed.data.purpose, target: maskTarget(parsed.data.target), provider: "twilio" },
    });
    return NextResponse.json({ error: r.message ?? "Invalid code" }, { status: 400 });
  }

  // Fallback: self-managed OTP verification (MSG91 / email)
  const otp = await prisma.otp.findFirst({
    where: { target: parsed.data.target, purpose: parsed.data.purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }
  });

  if (!otp) return NextResponse.json({ error: "OTP expired or not found" }, { status: 400 });
  if (otp.attempts >= 5) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  if (otp.codeHash !== sha256(parsed.data.code)) {
    await prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    await logSecurityEvent({
      action: "auth.otp_failed",
      severity: "warn",
      entity: "Otp",
      entityId: otp.id,
      ip,
      userAgent: req.headers.get("user-agent"),
      meta: { purpose: parsed.data.purpose, target: maskTarget(parsed.data.target) },
    });
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { consumed: true } });
  await logSecurityEvent({
    action: "auth.otp_verified",
    entity: "Otp",
    entityId: otp.id,
    ip,
    userAgent: req.headers.get("user-agent"),
    meta: { purpose: parsed.data.purpose, target: maskTarget(parsed.data.target) },
  });
  return NextResponse.json({ ok: true });
}
