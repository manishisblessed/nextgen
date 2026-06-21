import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";

const CreateBody = z.object({
  phone: z.string().min(10).max(15),
  email: z.string().email(),
  name: z.string().min(2).optional(),
  role: z.enum(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR"]),
  parentId: z.string().optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(user.role)) {
    return NextResponse.json(
      { error: "Only admins can create invites" },
      { status: 403 }
    );
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { phone, email, name, role, parentId } = parsed.data;

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

  if (parentId) {
    const parent = await prisma.user.findUnique({ where: { id: parentId } });
    if (!parent) {
      return NextResponse.json({ error: "Parent user not found" }, { status: 404 });
    }
  }

  const invite = await prisma.invite.create({
    data: {
      phone,
      email: email.toLowerCase(),
      name,
      role,
      parentId,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const onboardingLink = `${appUrl}/onboard?token=${invite.token}`;

  try {
    const emailProvider = getPartner("email");
    await emailProvider.send({
      to: email,
      subject: "NextGenPay — Complete your registration",
      html: `
        <h2>Welcome to NextGenPay!</h2>
        <p>You have been invited to join as a <strong>${role.replace("_", " ")}</strong>.</p>
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
      variables: { link: onboardingLink, role: role.replace("_", " ") },
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
      ip: req.headers.get("x-forwarded-for") ?? undefined,
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

  if (!["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(user.role)) {
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
