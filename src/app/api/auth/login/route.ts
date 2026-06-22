import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createMobileToken } from "@/lib/auth-server";
import { createTempToken } from "@/lib/two-factor";

const Body = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Step 1 of login — validates email/phone + password.
 *
 * If 2FA is enabled: returns { needs2FA: true, tempToken } — no session issued.
 * If 2FA is NOT enabled: returns { needs2FA: false, needsSetup: true } for mandatory setup.
 * Legacy (2FA not required): returns full token + user. (removed — 2FA is now mandatory)
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { identifier, password } = parsed.data;
  const normalized = identifier.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { phone: normalized }],
      deletedAt: null,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.status === "CLOSED") {
    return NextResponse.json({ error: "Account has been closed" }, { status: 403 });
  }

  // 2FA is mandatory for all users
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    // User has 2FA configured — issue temp token for step 2
    const tempToken = createTempToken(user.id);
    return NextResponse.json({
      ok: true,
      needs2FA: true,
      needsSetup: false,
      tempToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }

  // 2FA NOT configured — issue a limited session for setup only
  // The frontend must redirect to 2FA setup before granting full access
  const sessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    walletBalance: Number(user.walletBalance),
    allowedTabs: user.allowedTabs ?? [],
    twoFactorEnabled: user.twoFactorEnabled,
  };

  const token = createMobileToken(sessionUser);

  return NextResponse.json({
    ok: true,
    needs2FA: false,
    needsSetup: true,
    token,
    user: sessionUser,
  });
}
