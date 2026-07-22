import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertCaptcha } from "@/lib/security/captcha";
import { assertPasswordNotBreached } from "@/lib/security/breachedPassword";
import { logSecurityEvent, clientIp } from "@/lib/security/audit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { generateNextUserCode } from "@/lib/userCode";

const Body = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(8).max(72),
  role: z.enum(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR"]).default("RETAILER"),
  referralCode: z.string().optional(),
  captchaToken: z.string().max(4000).optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, phone, password, role } = parsed.data;

  try {
    // Throttle account creation per IP, gate bots, and reject breached passwords.
    await enforceRateLimit(`register:ip:${ip}`, RATE_LIMITS.register);
    await assertCaptcha(parsed.data.captchaToken, ip);
    await assertPasswordNotBreached(password);
  } catch (e) {
    return toErrorResponse(e);
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { phone }] },
  });

  if (existing) {
    const field = existing.email === email.toLowerCase() ? "email" : "phone";
    return NextResponse.json(
      { error: `An account with this ${field} already exists` },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Phase 14: the account is created WITHOUT a liveness baseline
  // (hasLivenessVideo defaults to false). For network self-registrants this
  // makes the account non-transaction-capable: the liveness gate blocks all
  // money movement and the dashboard routes them to /dashboard/liveness to
  // record their 10-second video before they can transact. Login/read stay open.
  const userCode = await generateNextUserCode(role);

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      phone,
      passwordHash,
      role,
      status: "PENDING_KYC",
      userCode,
    },
  });

  await logSecurityEvent({
    action: "auth.register",
    severity: "info",
    userId: user.id,
    entity: "User",
    entityId: user.id,
    ip,
    userAgent,
    meta: { role: user.role },
  });

  // Send welcome email
  try {
    const emailProvider = getPartner("email");
    await emailProvider.send({
      to: user.email,
      subject: "Welcome to NextGenPay!",
      html: `
        <h2>Welcome, ${user.name}!</h2>
        <p>Your NextGenPay account has been created successfully.</p>
        <p>Role: <strong>${user.role}</strong></p>
        <p>Next step: Complete your KYC verification to start using services.</p>
        <br/>
        <p>— Team NextGenPay</p>
      `,
    });
  } catch {
    // Non-blocking — user is still registered even if email fails
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
    },
  }, { status: 201 });
}
