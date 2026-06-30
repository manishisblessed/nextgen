import { prisma } from "../db";
import { encryptField, decryptField } from "../crypto/fieldEncryption";

/**
 * Face baseline resolution for the monthly face match (Phase 13 / Task 7).
 *
 * The canonical onboarding baseline is Phase 14's `KycVideo.faceBaselineRefEnc`
 * (registered from the 10-second onboarding liveness video). We prefer it; the
 * ReKycLog-backed store remains a legacy fallback for users enrolled before
 * Phase 14 landed:
 *
 *   - Onboarding video baseline present     → MATCH the fresh probe against it.
 *   - No video baseline, legacy/first cycle  → ENROLL: the fresh liveness probe
 *     becomes the baseline (its provider reference is field-encrypted and parked
 *     on the PASSED ReKycLog).
 *   - Every subsequent cycle                → MATCH against the stored baseline.
 */

/** Decrypted provider reference for the user's enrolled face baseline, or null. */
export async function getFaceBaselineRef(userId: string): Promise<string | null> {
  // Phase 14 (canonical): the onboarding liveness video's registered baseline.
  const video = await prisma.kycVideo.findUnique({
    where: { userId },
    select: { status: true, faceBaselineRefEnc: true },
  });
  if (video?.status === "BASELINE_READY" && video.faceBaselineRefEnc) {
    try {
      return decryptField(video.faceBaselineRefEnc);
    } catch {
      // Tampered/rotated key — fall through to the legacy log-backed store.
    }
  }

  // Legacy fallback: a baseline enrolled on a past PASSED ReKycLog.
  const logs = await prisma.reKycLog.findMany({
    where: { userId, status: "PASSED" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { meta: true },
  });
  for (const l of logs) {
    const enc = (l.meta as Record<string, unknown> | null)?.faceBaselineRefEnc;
    if (typeof enc === "string" && enc) {
      try {
        return decryptField(enc);
      } catch {
        // Tampered/rotated key — fall through and treat as no baseline.
      }
    }
  }
  return null;
}

/** True when the user already has a usable face baseline (vs. legacy/no baseline). */
export async function hasLivenessBaseline(userId: string): Promise<boolean> {
  return (await getFaceBaselineRef(userId)) !== null;
}

/** Field-encrypt a provider face reference for at-rest storage. */
export function encryptBaselineRef(ref: string): string {
  return encryptField(ref);
}
