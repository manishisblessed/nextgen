import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createMobileToken } from "@/lib/auth-server";

const Body = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

/**
 * Direct login endpoint (for mobile app / API consumers).
 * Web UI should use NextAuth's signIn() which hits /api/auth/[...nextauth].
 * Returns a JWT token for mobile clients alongside user data.
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

  const sessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    walletBalance: Number(user.walletBalance),
    allowedTabs: user.allowedTabs ?? [],
  };

  const token = createMobileToken(sessionUser);

  return NextResponse.json({
    ok: true,
    token,
    user: sessionUser,
  });
}
