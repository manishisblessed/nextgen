import { prisma } from "@/lib/db";
import { decryptField } from "@/lib/crypto/fieldEncryption";
import { deleteKycVideoObject, kycStorageConfigured } from "@/lib/storage/s3Kyc";
import { logger } from "@/lib/logger";
import { sendOpsAlert } from "@/lib/monitoring/alerts";

/**
 * KYC-video retention purger (Phase 5 — compliance maturity, data minimization).
 *
 * The raw liveness video is only needed until the face baseline is registered
 * and any manual review window has passed. Keeping biometric raw material
 * around forever is a liability (DPDP Act data-minimization), so after the
 * retention window the S3 object is deleted while the row — sha256 digest,
 * duration, consent timestamp, baseline reference — is retained as the
 * compliance record of WHAT was captured and verified.
 *
 * Guard rails:
 *   - opt-in via KYC_VIDEO_RETENTION_ENABLED=true (destructive; ops decision)
 *   - only BASELINE_READY rows are eligible (FAILED/UPLOADED may still be needed)
 *   - batch-limited per run; every purge is audit-logged
 */

export function retentionEnabled(): boolean {
  return process.env.KYC_VIDEO_RETENTION_ENABLED === "true";
}

export function retentionDays(): number {
  const n = Number(process.env.KYC_VIDEO_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 30 ? n : 180; // floor of 30d — review window
}

export async function runKycVideoRetention(
  now = new Date(),
  batchLimit = 50
): Promise<{ purged: number; failed: number; skipped: boolean }> {
  if (!retentionEnabled()) {
    return { purged: 0, failed: 0, skipped: true };
  }
  if (!kycStorageConfigured()) {
    logger.warn({ action: "kyc.retention_skipped", reason: "S3 not configured" });
    return { purged: 0, failed: 0, skipped: true };
  }

  const cutoff = new Date(now.getTime() - retentionDays() * 86_400_000);
  const rows = await prisma.kycVideo.findMany({
    where: { status: "BASELINE_READY", purgedAt: null, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: batchLimit,
    select: { id: true, userId: true, storageKeyEnc: true, createdAt: true },
  });

  let purged = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteKycVideoObject(decryptField(row.storageKeyEnc));
      await prisma.kycVideo.update({ where: { id: row.id }, data: { purgedAt: now } });
      await prisma.auditLog.create({
        data: {
          userId: row.userId,
          action: "kyc.video_purged",
          entity: "KycVideo",
          entityId: row.id,
          meta: { capturedAt: row.createdAt.toISOString(), retentionDays: retentionDays() },
        },
      });
      purged += 1;
    } catch (e) {
      failed += 1;
      logger.warn({ action: "kyc.retention_purge_failed", kycVideoId: row.id, err: String(e) });
    }
  }

  if (failed > 0) {
    await sendOpsAlert({
      title: "KYC video retention purge had failures",
      severity: "warning",
      details: { purged, failed },
    });
  }
  if (purged > 0 || failed > 0) {
    logger.info({ action: "kyc.retention_done", purged, failed });
  }
  return { purged, failed, skipped: false };
}
