import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const RegisterBody = z.object({
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(72),
  shopName: z.string().min(1),
  shopAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().min(2),
  pincode: z.string().length(6),
  panNumber: z.string().length(10).regex(/^[A-Z]{5}\d{4}[A-Z]$/).optional(),
  aadhaarLast4: z.string().length(4).regex(/^\d{4}$/).optional(),
  gstin: z.string().length(15).optional(),
  bankAccountNumber: z.string().min(8).max(20).optional(),
  bankIfsc: z.string().length(11).optional(),
  bankName: z.string().optional(),
  dob: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  }

  if (!["PENDING", "REGISTERED"].includes(invite.status)) {
    return NextResponse.json(
      { error: "This invite is no longer accepting registration" },
      { status: 400 }
    );
  }

  if (new Date() > invite.expiresAt) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
  }

  const parsed = RegisterBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const passwordHash = await bcrypt.hash(data.password, 12);

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: invite.email }, { phone: invite.phone }] },
  });

  if (existingUser && invite.userId !== existingUser.id) {
    return NextResponse.json(
      { error: "A user with this email or phone already exists" },
      { status: 409 }
    );
  }

  const verifications = await prisma.verificationResult.findMany({
    where: { inviteId: invite.id, status: "Success" },
    select: { type: true },
  });
  const verifiedTypes = new Set(verifications.map((v) => v.type));

  const allVerified =
    verifiedTypes.has("PAN_360") &&
    (verifiedTypes.has("BANK_PENNY_DROP") || verifiedTypes.has("BANK_ADVANCE"));

  const newStatus = allVerified ? "VERIFIED" : "REGISTERED";

  const result = await prisma.$transaction(async (tx) => {
    let user;
    if (invite.userId && existingUser) {
      user = await tx.user.update({
        where: { id: invite.userId },
        data: {
          name: data.name,
          passwordHash,
          shopName: data.shopName,
          shopAddress: data.shopAddress,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
        },
      });
    } else {
      user = await tx.user.create({
        data: {
          name: data.name,
          email: invite.email,
          phone: invite.phone,
          passwordHash,
          role: invite.role,
          status: "PENDING_KYC",
          parentId: invite.parentId,
          shopName: data.shopName,
          shopAddress: data.shopAddress,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
        },
      });
    }

    if (data.panNumber || data.aadhaarLast4 || data.gstin) {
      await tx.kyc.upsert({
        where: { userId: user.id },
        update: {
          panNumber: data.panNumber?.toUpperCase(),
          aadhaarLast4: data.aadhaarLast4,
          gstin: data.gstin,
          dob: data.dob ? new Date(data.dob) : undefined,
          panVerifiedAt: verifiedTypes.has("PAN_360") ? new Date() : undefined,
          aadhaarVerifiedAt: verifiedTypes.has("AADHAAR_DIGILOCKER") ? new Date() : undefined,
          status: allVerified ? "PENDING_REVIEW" : "NOT_STARTED",
          submittedAt: allVerified ? new Date() : undefined,
        },
        create: {
          userId: user.id,
          panNumber: data.panNumber?.toUpperCase(),
          aadhaarLast4: data.aadhaarLast4,
          gstin: data.gstin,
          dob: data.dob ? new Date(data.dob) : undefined,
          panVerifiedAt: verifiedTypes.has("PAN_360") ? new Date() : undefined,
          aadhaarVerifiedAt: verifiedTypes.has("AADHAAR_DIGILOCKER") ? new Date() : undefined,
          status: allVerified ? "PENDING_REVIEW" : "NOT_STARTED",
          submittedAt: allVerified ? new Date() : undefined,
        },
      });
    }

    await tx.invite.update({
      where: { id: invite.id },
      data: {
        status: newStatus as any,
        userId: user.id,
        name: data.name,
        registeredAt: new Date(),
        verifiedAt: allVerified ? new Date() : undefined,
      },
    });

    await tx.verificationResult.updateMany({
      where: { inviteId: invite.id },
      data: { userId: user.id },
    });

    return user;
  });

  await prisma.auditLog.create({
    data: {
      userId: result.id,
      action: "onboard.registered",
      entity: "Invite",
      entityId: invite.id,
      meta: {
        role: invite.role,
        verifiedTypes: Array.from(verifiedTypes),
        allVerified,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    status: newStatus,
    user: {
      id: result.id,
      name: result.name,
      email: result.email,
      role: result.role,
      status: result.status,
    },
    message: allVerified
      ? "Registration complete. Awaiting admin approval."
      : "Registration saved. Please complete all verifications.",
  });
}
