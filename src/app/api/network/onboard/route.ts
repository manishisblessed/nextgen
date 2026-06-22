import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";

const Body = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  shopName: z.string().min(1),
  pincode: z.string().length(6),
  state: z.string().min(2),
  city: z.string().optional(),
  panNumber: z.string().length(10).optional(),
  role: z.enum(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR"]).optional(),
});

export async function POST(req: Request) {
  try {
    const currentUser = await requireAuth();
    const userRole = currentUser.role;

    if (!["MASTER_ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "ADMIN"].includes(userRole))
      return NextResponse.json(
        { error: "Only admins, distributors, or master distributors can onboard users" },
        { status: 403 }
      );

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const data = parsed.data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { phone: data.phone }] },
    });
    if (existing)
      return NextResponse.json(
        { error: "A user with this email or phone already exists" },
        { status: 409 }
      );

    let childRole = data.role;
    if (!childRole) {
      if (userRole === "MASTER_ADMIN" || userRole === "ADMIN") childRole = "RETAILER";
      else if (userRole === "MASTER_DISTRIBUTOR") childRole = "DISTRIBUTOR";
      else childRole = "RETAILER";
    }

    // Only MASTER_ADMIN / ADMIN can create MASTER_DISTRIBUTOR
    if (childRole === "MASTER_DISTRIBUTOR" && !["MASTER_ADMIN", "ADMIN"].includes(userRole)) {
      return NextResponse.json(
        { error: "Only admins can create master distributors" },
        { status: 403 }
      );
    }

    const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: childRole as any,
        status: "PENDING_KYC",
        shopName: data.shopName,
        pincode: data.pincode,
        state: data.state,
        city: data.city,
        parentId: currentUser.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: "user.onboard",
        entity: "User",
        entityId: user.id,
        meta: { childRole, email: data.email },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    // Send welcome email with temporary credentials
    try {
      const email = getPartner("email");
      await email.send({
        to: data.email,
        subject: "Welcome to NextGenPay — Your account is ready",
        html: `
          <h2>Welcome to NextGenPay, ${data.name}!</h2>
          <p>Your account has been created by ${currentUser.name}.</p>
          <p><strong>Login credentials:</strong></p>
          <ul>
            <li>Email: ${data.email}</li>
            <li>Temporary password: <code>${tempPassword}</code></li>
          </ul>
          <p>Please log in and change your password immediately.</p>
          <p>You'll also need to complete your KYC verification before you can start transacting.</p>
        `,
      });
    } catch {
      // Email failure shouldn't block onboarding
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: childRole,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[network/onboard] POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
