import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { clientIp, logSecurityEvent } from "@/lib/security/audit";
import { decryptField } from "@/lib/crypto/fieldEncryption";
import { presignKycVideoGet } from "@/lib/storage/s3Kyc";
import { toErrorResponse } from "@/lib/security/apiErrors";

/**
 * Audited admin access to a user's onboarding liveness video (Phase 14).
 *
 * Biometric PII — restricted to ADMIN / MASTER_ADMIN. Returns a short-TTL
 * (<= 60s) presigned GET URL, generated server-side only. Normal users never
 * reach this route. Every access writes an AuditLog (who / why / when).
 */
const Query = z.object({
  // A stated reason is mandatory so the access is justifiable in the audit trail.
  reason: z.string().trim().min(4).max(280),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const admin = await requireRole("ADMIN", "MASTER_ADMIN");
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    await enforceRateLimit(`kyc:video:adminview:${admin.id}`, RATE_LIMITS.kycVideoAdminView);

    const url = new URL(req.url);
    const parsed = Query.safeParse({ reason: url.searchParams.get("reason") ?? "" });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A reason (4-280 chars) is required to view a liveness video." },
        { status: 400 }
      );
    }

    const row = await prisma.kycVideo.findUnique({
      where: { userId: params.userId },
      select: { id: true, storageKeyEnc: true, status: true, createdAt: true },
    });
    if (!row) {
      return NextResponse.json({ error: "No liveness video for this user." }, { status: 404 });
    }

    const key = decryptField(row.storageKeyEnc);
    const signedUrl = await presignKycVideoGet(key, { expiresInSec: 60 });

    // Audit BEFORE returning the URL: who / why / when / whose video.
    await logSecurityEvent({
      action: "kyc.video.admin_viewed",
      severity: "warn",
      userId: admin.id,
      entity: "KycVideo",
      entityId: row.id,
      ip,
      userAgent,
      meta: { targetUserId: params.userId, reason: parsed.data.reason },
    });

    return NextResponse.json({ url: signedUrl, expiresInSec: 60, status: row.status });
  } catch (e) {
    return toErrorResponse(e);
  }
}
