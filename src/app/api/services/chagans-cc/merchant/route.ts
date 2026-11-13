import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { prisma } from "@/lib/db";
import { chagansCcCreateMerchant } from "@/lib/partners/chagans-cc-bill";
import { getBbpsMerchantStatus } from "@/lib/services/bbpsMerchant";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

// Validation matching Chagans requirements
const CreateMerchantBody = z
  .object({
    mobile: z.string().regex(/^\d{10}$/, "Mobile must be exactly 10 digits"),
    name: z.string().min(2, "Name is required").max(100),
    gender: z.enum(["M", "F", "O"]),
    pan: z
      .string()
      .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Invalid PAN format (e.g. ABCDE1234F)"),
    email: z.string().email("Invalid email"),
    address: z.object({
      full: z.string().min(5, "Full address is required"),
      city: z.string().min(2, "City is required"),
      pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"),
    }),
    aadhaar: z.string().regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits"),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
    latitude: z.string().min(1),
    longitude: z.string().min(1),
    bankAccountNo: z.string().min(8, "Bank account number is required").max(20),
    bankIfsc: z
      .string()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
  })
  .strict();

/**
 * GET /api/services/chagans-cc/merchant
 * Returns the user's BBPS merchant onboarding status.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError("CC Bill Payment is available for retailers only", 403);

    const merchant = await getBbpsMerchantStatus(user.id);

    return NextResponse.json({
      merchant,
      canTransact: !!(
        merchant?.status === "ACTIVE" && merchant.providerMerchantId
      ),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * POST /api/services/chagans-cc/merchant
 * Creates a new merchant via Chagans createMerchant API.
 * If the user already has an ACTIVE merchant, returns 409.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError("CC Bill Payment is available for retailers only", 403);
    await assertServiceEnabled(SERVICE_KEYS.BBPS_CHAGANS, {
      name: "CC Bill Payment",
      userId: user.id,
      role: user.role,
    });
    await enforceRateLimit(
      `chagans-merchant:create:${user.id}`,
      RATE_LIMITS.default
    );
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = CreateMerchantBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );

  const d = parsed.data;

  try {
    // Check for existing merchant record
    const existing = await prisma.bbpsMerchant.findUnique({
      where: { userId: user.id },
    });

    if (existing?.status === "ACTIVE" && existing.providerMerchantId) {
      return NextResponse.json(
        {
          error: "You already have an active merchant account",
          merchantId: existing.providerMerchantId,
          status: existing.status,
        },
        { status: 409 }
      );
    }

    if (existing?.status === "PENDING") {
      return NextResponse.json(
        {
          error:
            "Your merchant onboarding is already in progress. Please wait for verification.",
          status: existing.status,
        },
        { status: 409 }
      );
    }

    // Call Chagans createMerchant
    const result = await chagansCcCreateMerchant({
      mobile: d.mobile,
      name: d.name,
      gender: d.gender,
      pan: d.pan,
      email: d.email,
      address: d.address,
      aadhaar: d.aadhaar,
      dateOfBirth: d.dateOfBirth,
      latitude: d.latitude,
      longitude: d.longitude,
      bankAccountNo: d.bankAccountNo,
      bankIfsc: d.bankIfsc,
    });

    if (!result.ok) {
      // If there's an existing REJECTED record, update it to PENDING for retry
      if (existing?.status === "REJECTED") {
        await prisma.bbpsMerchant.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            meta: {
              name: d.name,
              mobile: d.mobile,
              email: d.email,
              pan: d.pan.slice(0, 5) + "****" + d.pan.slice(-1),
              city: d.address.city,
              pincode: d.address.pincode,
              lastAttempt: new Date().toISOString(),
              error: result.message,
            },
          },
        });
      }

      return NextResponse.json(
        {
          error:
            result.message ??
            "Merchant onboarding failed — please check your details and try again",
          code: result.code,
        },
        { status: 400 }
      );
    }

    // Success — upsert the merchant record
    const merchant = await prisma.bbpsMerchant.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        provider: "CHAGANS",
        providerMerchantId: result.data.merchantId,
        kycStatus: result.data.kycStatus,
        status: "ACTIVE",
        activatedAt: new Date(),
        meta: {
          name: d.name,
          mobile: d.mobile,
          email: d.email,
          pan: d.pan.slice(0, 5) + "****" + d.pan.slice(-1),
          city: d.address.city,
          pincode: d.address.pincode,
          bankIfsc: d.bankIfsc,
          createdVia: "self-onboarding",
        },
      },
      update: {
        providerMerchantId: result.data.merchantId,
        kycStatus: result.data.kycStatus,
        status: "ACTIVE",
        activatedAt: new Date(),
        suspendedAt: null,
        meta: {
          name: d.name,
          mobile: d.mobile,
          email: d.email,
          pan: d.pan.slice(0, 5) + "****" + d.pan.slice(-1),
          city: d.address.city,
          pincode: d.address.pincode,
          bankIfsc: d.bankIfsc,
          createdVia: "self-onboarding",
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "bbps.merchant_created",
        entity: "BbpsMerchant",
        entityId: merchant.id,
        meta: {
          merchantId: result.data.merchantId,
          kycStatus: result.data.kycStatus,
          provider: "CHAGANS",
        },
        ip: clientIp(req),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        merchantId: result.data.merchantId,
        kycStatus: result.data.kycStatus,
        status: "ACTIVE",
      },
      { status: 201 }
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
