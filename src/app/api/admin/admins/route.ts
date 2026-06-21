import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(8),
  allowedTabs: z.array(z.string()).default([]),
});

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const where: Record<string, unknown> = { role: "ADMIN", deletedAt: null };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }

  const admins = await prisma.user.findMany({
    where: where as any,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      allowedTabs: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ admins });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, phone, password, allowedTabs } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { phone }], deletedAt: null },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email or phone already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      allowedTabs,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      allowedTabs: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "admin.created",
      entity: "User",
      entityId: admin.id,
      meta: { name, email, phone, allowedTabs },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, admin }, { status: 201 });
}
