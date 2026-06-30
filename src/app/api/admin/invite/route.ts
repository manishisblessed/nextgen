import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { getPartner } from "@/lib/partners";
import { canOnboard, defaultChildRole, ONBOARD_CAPABLE_ROLES } from "@/lib/hierarchy";
import { env } from "@/lib/env";

const CreateBody = z.object({
  phone: z.string().min(10).max(15),
  email: z.string().email(),
  name: z.string().min(2).optional(),
  role: z.enum(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"]).optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!ONBOARD_CAPABLE_ROLES.includes(user.role as any)) {
    return NextResponse.json(
      { error: "You do not have permission to create invites" },
      { status: 403 }
    );
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { phone, email, name } = parsed.data;
  const role = parsed.data.role ?? defaultChildRole(user.role);

  if (!canOnboard(user.role, role)) {
    const allowed = defaultChildRole(user.role).replace(/_/g, " ");
    return NextResponse.json(
      { error: `Your role can only invite a ${allowed}` },
      { status: 403 }
    );
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { phone }] },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: "A user with this email or phone already exists" },
      { status: 409 }
    );
  }

  const existingInvite = await prisma.invite.findFirst({
    where: {
      OR: [{ email: email.toLowerCase() }, { phone }],
      status: { in: ["PENDING", "REGISTERED"] },
    },
  });
  if (existingInvite) {
    return NextResponse.json(
      { error: "An active invite already exists for this email or phone" },
      { status: 409 }
    );
  }

  // For network roles, they are the parent. For admin, no parent (SD is top-level).
  const parentId = ["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(user.role)
    ? undefined
    : user.id;

  const invite = await prisma.invite.create({
    data: {
      phone,
      email: email.toLowerCase(),
      name,
      role,
      parentId,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const onboardingLink = `${appUrl}/onboard?token=${invite.token}`;

  try {
    const emailProvider = getPartner("email");
    await emailProvider.send({
      from: process.env.EMAIL_FROM_INFO || process.env.EMAIL_FROM,
      to: email,
      subject: "NextGenPay — Complete your registration",
      html: `
        <h2>Welcome to NextGenPay!</h2>
        <p>You have been invited to join as a <strong>${role.replace(/_/g, " ")}</strong>.</p>
        <p>Please complete your registration by clicking the link below:</p>
        <p><a href="${onboardingLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Complete Registration</a></p>
        <p>This link expires in 7 days.</p>
        <br/>
        <p>— Team NextGenPay</p>
      `,
    });
  } catch {
    // Email failure shouldn't block invite creation
  }

  try {
    const smsProvider = getPartner("sms");
    await smsProvider.sendTransactional({
      phone,
      templateId: "onboard_invite",
      variables: { link: onboardingLink, role: role.replace(/_/g, " ") },
    });
  } catch {
    // SMS failure shouldn't block invite creation
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "invite.created",
      entity: "Invite",
      entityId: invite.id,
      meta: { phone, email, role, parentId },
      ip: clientIp(req),
    },
  });

  return NextResponse.json(
    { ok: true, invite: { id: invite.id, token: invite.token, onboardingLink } },
    { status: 201 }
  );
}

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  // Only admin roles can list all invites (user data protection)
  if (!["MASTER_ADMIN", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));

  const where = status ? { status: status as any } : {};

  const [invites, total] = await Promise.all([
    prisma.invite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.invite.count({ where }),
  ]);

  return NextResponse.json({ invites, total, page, limit });
}
