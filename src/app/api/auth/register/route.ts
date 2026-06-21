import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";

const Body = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(8).max(72),
  role: z.enum(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR"]).default("RETAILER"),
  referralCode: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, phone, password, role } = parsed.data;

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

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      phone,
      passwordHash,
      role,
      status: "PENDING_KYC",
    },
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
