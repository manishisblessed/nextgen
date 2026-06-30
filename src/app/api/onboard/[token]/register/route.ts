import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";
import { assertPasswordNotBreached, BreachedPasswordError } from "@/lib/security/breachedPassword";
import { env } from "@/lib/env";

const RegisterBody = z.object({
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(72),
  shopName: z.string().min(1),
  shopAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().min(2),
  pincode: z.string().length(6),
  panNumber: z.string().length(10).regex(/^[A-Z]{5}\d{4}[A-Z]$/).optional(),
  panName: z.string().optional(),
  aadhaarLast4: z.string().length(4).regex(/^\d{4}$/).optional(),
  aadhaarNumber: z.string().optional(),
  aadhaarName: z.string().optional(),
  aadhaarDob: z.string().optional(),
  aadhaarGender: z.string().optional(),
  aadhaarAddress: z.string().optional(),
  aadhaarMobile: z.string().optional(),
  bankAccountNumber: z.string().min(8).max(20).optional(),
  bankIfsc: z.string().length(11).optional(),
  bankName: z.string().optional(),
  bankAccountStatus: z.string().optional(),
  gstin: z.string().length(15).optional(),
  msmeNumber: z.string().optional(),
  nameMismatch: z.boolean().default(false),
  dob: z.string().optional(),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

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

  if (!invite.phoneVerifiedAt) {
    return NextResponse.json(
      { error: "Please verify your mobile number before registering" },
      { status: 400 }
    );
  }

  if (!invite.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Please verify your email address before registering" },
      { status: 400 }
    );
  }

  const parsed = RegisterBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  try {
    await assertPasswordNotBreached(data.password);
  } catch (e) {
    if (e instanceof BreachedPasswordError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

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
    where: { inviteId: invite.id },
    select: { type: true, status: true },
  });
  const verifiedTypes = new Set(
    verifications.filter((v) => v.status === "Success").map((v) => v.type)
  );
  const uploadedDocTypes = new Set(
    verifications
      .filter((v) => v.status === "Uploaded" && v.type.startsWith("DOCUMENT_"))
      .map((v) => v.type.replace("DOCUMENT_", ""))
  );

  const hasAadhaar = verifiedTypes.has("AADHAAR_DIGILOCKER");
  const hasPan = verifiedTypes.has("PAN_360");
  const hasBank = verifiedTypes.has("BANK_PENNY_DROP") || verifiedTypes.has("BANK_ADVANCE");

  const MANDATORY_DOC_TYPES = [
    "GST_CERT",
    "SHOP_ESTABLISHMENT",
    "GUMASTA_LICENSE",
    "SIGNATURE",
    "ELECTRICITY_BILL",
    "CANCEL_CHEQUE",
    "ADDITIONAL_ID",
    "FAMILY_REFERENCE",
    "PG_FORM",
    "GPS_PHOTO_OUTSIDE",
    "GPS_PHOTO_INSIDE",
    "GPS_SELFIE_DISTRIBUTOR",
    "DISTRIBUTOR_DECLARATION",
  ];

  const missingDocs = MANDATORY_DOC_TYPES.filter((t) => !uploadedDocTypes.has(t));
  if (missingDocs.length > 0) {
    return NextResponse.json(
      {
        error: `Missing required documents: ${missingDocs.join(", ")}. Please upload all mandatory documents before submitting.`,
      },
      { status: 400 }
    );
  }

  const hasSelfie = uploadedDocTypes.has("SELFIE");
  if (!hasSelfie) {
    return NextResponse.json(
      { error: "Please upload your live selfie photo before submitting." },
      { status: 400 }
    );
  }

  const allVerified = hasPan && hasAadhaar && hasBank && !data.nameMismatch;
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
          phoneVerifiedAt: invite.phoneVerifiedAt,
          emailVerifiedAt: invite.emailVerifiedAt,
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
          phoneVerifiedAt: invite.phoneVerifiedAt,
          emailVerifiedAt: invite.emailVerifiedAt,
        },
      });
    }

    await tx.kyc.upsert({
      where: { userId: user.id },
      update: {
        panNumber: data.panNumber?.toUpperCase(),
        panName: data.panName,
        aadhaarLast4: data.aadhaarLast4,
        aadhaarNumber: data.aadhaarNumber,
        aadhaarName: data.aadhaarName,
        aadhaarDob: data.aadhaarDob,
        aadhaarGender: data.aadhaarGender,
        aadhaarAddress: data.aadhaarAddress,
        aadhaarMobile: data.aadhaarMobile,
        bankAccountName: data.bankName,
        bankAccountNumber: data.bankAccountNumber,
        bankIfsc: data.bankIfsc?.toUpperCase(),
        bankAccountStatus: data.bankAccountStatus,
        gstin: data.gstin?.toUpperCase(),
        msmeNumber: data.msmeNumber || undefined,
        nameMismatch: data.nameMismatch,
        dob: data.dob ? new Date(data.dob) : undefined,
        panVerifiedAt: hasPan ? new Date() : undefined,
        aadhaarVerifiedAt: hasAadhaar ? new Date() : undefined,
        status: allVerified ? "PENDING_REVIEW" : "NOT_STARTED",
        submittedAt: new Date(),
      },
      create: {
        userId: user.id,
        panNumber: data.panNumber?.toUpperCase(),
        panName: data.panName,
        aadhaarLast4: data.aadhaarLast4,
        aadhaarNumber: data.aadhaarNumber,
        aadhaarName: data.aadhaarName,
        aadhaarDob: data.aadhaarDob,
        aadhaarGender: data.aadhaarGender,
        aadhaarAddress: data.aadhaarAddress,
        aadhaarMobile: data.aadhaarMobile,
        bankAccountName: data.bankName,
        bankAccountNumber: data.bankAccountNumber,
        bankIfsc: data.bankIfsc?.toUpperCase(),
        bankAccountStatus: data.bankAccountStatus,
        gstin: data.gstin?.toUpperCase(),
        msmeNumber: data.msmeNumber || undefined,
        nameMismatch: data.nameMismatch,
        dob: data.dob ? new Date(data.dob) : undefined,
        panVerifiedAt: hasPan ? new Date() : undefined,
        aadhaarVerifiedAt: hasAadhaar ? new Date() : undefined,
        status: allVerified ? "PENDING_REVIEW" : "NOT_STARTED",
        submittedAt: new Date(),
      },
    });

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
        nameMismatch: data.nameMismatch,
      },
    },
  });

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const loginUrl = `${appUrl}/login`;

  try {
    const emailProvider = getPartner("email");
    await emailProvider.send({
      to: invite.email,
      subject: "NextGenPay — Onboarding Complete!",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1e293b;font-size:24px;margin:0;">Welcome to NextGenPay!</h1>
          </div>
          <p>Dear <strong>${data.name}</strong>,</p>
          <p>Your onboarding as a <strong>${invite.role.replace(/_/g, " ")}</strong> has been completed successfully.${
        !allVerified
          ? " Your account is pending admin approval. You will be notified once approved."
          : " Your account is now under review and will be activated shortly."
      }</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
            <h3 style="margin:0 0 12px 0;color:#334155;font-size:16px;">Your Login Credentials</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;width:120px;">Email</td><td style="padding:6px 0;font-weight:600;">${invite.email}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;font-weight:600;">${invite.phone}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Password</td><td style="padding:6px 0;font-style:italic;color:#475569;">Use the password you set during registration</td></tr>
            </table>
          </div>
          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Login to NextGenPay</a>
          </div>
          <p style="color:#64748b;font-size:13px;">If you did not initiate this registration, please contact us immediately at support@nxtgpay.com.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="color:#94a3b8;font-size:12px;text-align:center;">NextGenPay — JMP NextGenPay Pvt. Ltd.</p>
        </div>
      `,
    });
  } catch {
    // Email failure shouldn't block registration
  }

  try {
    const smsProvider = getPartner("sms");
    await smsProvider.sendTransactional({
      phone: invite.phone,
      templateId: "onboard_success",
      variables: {
        name: data.name,
        role: invite.role.replace(/_/g, " "),
      },
    });
  } catch {
    // SMS failure shouldn't block registration
  }

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
      : "Registration saved. Your documents are under review for admin approval.",
  });
}
