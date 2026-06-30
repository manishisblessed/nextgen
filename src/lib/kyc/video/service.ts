import crypto from "crypto";
import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { isNetworkTier } from "../../security/kycGate";
import { logSecurityEvent } from "../../security/audit";
import { encryptField, decryptField } from "../../crypto/fieldEncryption";
import { enqueue, QUEUES } from "../../queue";
import {
  presignKycVideoPut,
  headKycVideoObject,
  getKycVideoObjectBytes,
  keyBelongsToUser,
  isAllowedVideoContentType,
  kycStorageConfigured,
  deleteKycVideoObject,
  KYC_VIDEO_MAX_BYTES,
  KYC_VIDEO_MAX_DURATION_SEC,
  type KycVideoContentType,
} from "../../storage/s3Kyc";
import { randomLivenessPrompt } from "./prompts";
import { buildFaceBaseline } from "./face";

/**
 * Onboarding liveness video orchestration (Phase 14).
 *
 *   initiate  → consent check + presigned S3 PUT URL + random liveness prompt +
 *               a signed upload token that binds the user to the object key.
 *   complete  → verify the S3 object (exists / type / size), compute sha256,
 *               persist the encrypted reference, flip hasLivenessVideo=true, and
 *               enqueue the heavy ffmpeg + eKYC Hub baseline job.
 *   worker    → processKycVideoBaseline: extract a face frame, register the
 *               baseline, set status BASELINE_READY — or FAILED (re-block) if no
 *               usable face was detected.
 */

export class KycVideoError extends Error {
  constructor(message: string, public statusCode: number, public code: string) {
    super(message);
    this.name = "KycVideoError";
  }
}

type Ctx = { ip?: string | null; userAgent?: string | null };

// ── Upload token: HMAC binds (userId, key) so /complete cannot be called with an
//    arbitrary or someone else's object key. TTL matches the presigned PUT.
const UPLOAD_TOKEN_TTL_SEC = 120;

function uploadTokenSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error("[kyc.video] NEXTAUTH_SECRET or JWT_SECRET must be set");
  return s;
}

function signUploadToken(userId: string, key: string): string {
  const exp = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SEC;
  const payload = `${userId}:${key}:${exp}`;
  const b64 = Buffer.from(payload).toString("base64");
  const sig = crypto.createHmac("sha256", uploadTokenSecret()).update(payload).digest("hex");
  return `${b64}.${sig}`;
}

function verifyUploadToken(token: string, userId: string, key: string): boolean {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  let payload: string;
  try {
    payload = Buffer.from(b64, "base64").toString();
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha256", uploadTokenSecret()).update(payload).digest("hex");
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const [tUser, tKey, expStr] = payload.split(":");
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return tUser === userId && tKey === key;
}

export type LivenessStatus = {
  isNetworkTier: boolean;
  hasLivenessVideo: boolean;
  status: "UPLOADED" | "BASELINE_READY" | "FAILED" | null;
  /** True when a network user still owes a (re)capture. */
  required: boolean;
};

/** Drives the dashboard liveness banner/modal + the capture page. */
export async function getLivenessStatus(user: {
  id: string;
  role: string;
}): Promise<LivenessStatus> {
  const network = isNetworkTier(user.role);
  if (!network) {
    return { isNetworkTier: false, hasLivenessVideo: true, status: null, required: false };
  }
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { hasLivenessVideo: true, kycVideo: { select: { status: true } } },
  });
  const hasVideo = !!row?.hasLivenessVideo;
  return {
    isNetworkTier: true,
    hasLivenessVideo: hasVideo,
    status: row?.kycVideo?.status ?? null,
    required: !hasVideo,
  };
}

export type InitiateResult = {
  uploadUrl: string;
  key: string;
  uploadToken: string;
  contentType: string;
  prompt: string;
  expiresInSec: number;
  maxBytes: number;
  maxDurationSec: number;
};

export async function initiateKycVideo(
  user: { id: string; role: string },
  input: { consent: boolean; contentType: string },
  ctx: Ctx
): Promise<InitiateResult> {
  if (!isNetworkTier(user.role)) {
    throw new KycVideoError("Liveness capture does not apply to this role.", 400, "NOT_NETWORK_TIER");
  }
  if (!input.consent) {
    throw new KycVideoError(
      "Explicit consent is required to record and store your liveness video.",
      400,
      "CONSENT_REQUIRED"
    );
  }
  if (!isAllowedVideoContentType(input.contentType)) {
    throw new KycVideoError("Unsupported video format.", 400, "BAD_CONTENT_TYPE");
  }
  if (!kycStorageConfigured()) {
    throw new KycVideoError("Liveness video storage is not configured.", 503, "STORAGE_UNCONFIGURED");
  }

  const presigned = await presignKycVideoPut({
    userId: user.id,
    contentType: input.contentType as KycVideoContentType,
  });
  const uploadToken = signUploadToken(user.id, presigned.key);

  await logSecurityEvent({
    action: "kyc.video.initiated",
    severity: "info",
    userId: user.id,
    entity: "KycVideo",
    entityId: null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    meta: { contentType: input.contentType, consentAt: new Date().toISOString() },
  });

  return {
    uploadUrl: presigned.uploadUrl,
    key: presigned.key,
    uploadToken,
    contentType: presigned.contentType,
    prompt: randomLivenessPrompt(),
    expiresInSec: presigned.expiresInSec,
    maxBytes: KYC_VIDEO_MAX_BYTES,
    maxDurationSec: KYC_VIDEO_MAX_DURATION_SEC,
  };
}

export type CompleteResult = {
  status: "UPLOADED";
  kycVideoId: string;
  baselinePending: true;
};

export async function completeKycVideo(
  user: { id: string; role: string },
  input: { key: string; uploadToken: string; contentType: string; durationSec: number },
  ctx: Ctx
): Promise<CompleteResult> {
  if (!isNetworkTier(user.role)) {
    throw new KycVideoError("Liveness capture does not apply to this role.", 400, "NOT_NETWORK_TIER");
  }
  // Bind the completion to the exact key we presigned for this user.
  if (!keyBelongsToUser(input.key, user.id) || !verifyUploadToken(input.uploadToken, user.id, input.key)) {
    throw new KycVideoError("Invalid or expired upload token.", 403, "BAD_UPLOAD_TOKEN");
  }
  if (!isAllowedVideoContentType(input.contentType)) {
    throw new KycVideoError("Unsupported video format.", 400, "BAD_CONTENT_TYPE");
  }
  if (!Number.isFinite(input.durationSec) || input.durationSec <= 0 || input.durationSec > KYC_VIDEO_MAX_DURATION_SEC) {
    throw new KycVideoError(
      `Video must be at most ${KYC_VIDEO_MAX_DURATION_SEC} seconds.`,
      400,
      "DURATION_INVALID"
    );
  }

  // Verify the object exists and obeys the type/size limits BEFORE downloading.
  const head = await headKycVideoObject(input.key);
  if (!head) {
    throw new KycVideoError("No uploaded video found at the expected location.", 404, "OBJECT_MISSING");
  }
  if (head.contentType && !isAllowedVideoContentType(head.contentType)) {
    await deleteKycVideoObject(input.key).catch(() => {});
    throw new KycVideoError("Uploaded object has an unsupported content type.", 400, "BAD_CONTENT_TYPE");
  }
  if (head.contentLength <= 0 || head.contentLength > KYC_VIDEO_MAX_BYTES) {
    // Reject + purge anything over the cap so it never lingers in the bucket.
    await deleteKycVideoObject(input.key).catch(() => {});
    throw new KycVideoError("Uploaded video exceeds the maximum allowed size.", 413, "OBJECT_TOO_LARGE");
  }

  // Compute the sha256 integrity digest (bounded: size already validated <= max).
  const bytes = await getKycVideoObjectBytes(input.key);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  const storageKeyEnc = encryptField(input.key);
  const consentAt = new Date();

  const row = await prisma.$transaction(async (tx) => {
    const kv = await tx.kycVideo.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        provider: "s3",
        storageKeyEnc,
        sha256,
        durationSec: input.durationSec,
        sizeBytes: head.contentLength,
        contentType: input.contentType,
        status: "UPLOADED",
        consentAt,
        capturedIp: ctx.ip ?? null,
        capturedUa: ctx.userAgent ?? null,
      },
      update: {
        storageKeyEnc,
        sha256,
        durationSec: input.durationSec,
        sizeBytes: head.contentLength,
        contentType: input.contentType,
        status: "UPLOADED",
        faceBaselineRefEnc: null,
        consentAt,
        capturedIp: ctx.ip ?? null,
        capturedUa: ctx.userAgent ?? null,
      },
    });
    // Transaction-capable once the video is stored; the baseline job runs async.
    await tx.user.update({
      where: { id: user.id },
      data: { hasLivenessVideo: true },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "kyc.video.uploaded",
        entity: "KycVideo",
        entityId: kv.id,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        meta: { sizeBytes: head.contentLength, durationSec: input.durationSec, sha256 },
      },
    });
    return kv;
  });

  await logSecurityEvent({
    action: "kyc.video.uploaded",
    severity: "info",
    userId: user.id,
    entity: "KycVideo",
    entityId: row.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    persist: false,
    meta: { sizeBytes: head.contentLength, durationSec: input.durationSec },
  });

  // Heavy/external (ffmpeg + eKYC Hub) → worker. Deduped by KycVideo id.
  await enqueue(
    QUEUES.KYC_VIDEO_BASELINE,
    { kycVideoId: row.id },
    { singletonKey: `kyc.video.baseline:${row.id}`, retryLimit: 3, retryDelaySec: 30 }
  );

  return { status: "UPLOADED", kycVideoId: row.id, baselinePending: true };
}

/**
 * Worker pipeline: download the stored video, extract a face frame, register the
 * eKYC Hub baseline, and finalize the row. On success → BASELINE_READY. If no
 * usable face is detected → FAILED and hasLivenessVideo=false (re-block + prompt
 * a re-capture). Idempotent: a BASELINE_READY row is left untouched.
 */
export async function processKycVideoBaseline(kycVideoId: string): Promise<void> {
  const row = await prisma.kycVideo.findUnique({ where: { id: kycVideoId } });
  if (!row) return;
  if (row.status === "BASELINE_READY") return; // already done

  const key = decryptField(row.storageKeyEnc);
  const orderid = `KYCV${nanoid(16).toUpperCase()}`;

  let bytes: Buffer;
  try {
    bytes = await getKycVideoObjectBytes(key);
  } catch (e) {
    await prisma.kycVideo.update({
      where: { id: row.id },
      data: { status: "FAILED" },
    });
    await prisma.user.update({ where: { id: row.userId }, data: { hasLivenessVideo: false } });
    await logSecurityEvent({
      action: "kyc.video.baseline_failed",
      severity: "warn",
      userId: row.userId,
      entity: "KycVideo",
      entityId: row.id,
      meta: { code: "OBJECT_FETCH_FAILED", error: String(e) },
    });
    return;
  }

  const result = await buildFaceBaseline({
    userId: row.userId,
    videoBytes: bytes,
    contentType: row.contentType,
    orderid,
  });

  if (result.ok) {
    await prisma.$transaction([
      prisma.kycVideo.update({
        where: { id: row.id },
        data: {
          status: "BASELINE_READY",
          faceBaselineRefEnc: encryptField(result.baselineRef),
          // Trust ffprobe's authoritative duration over the client-reported value.
          durationSec: result.durationSec || row.durationSec,
        },
      }),
      prisma.user.update({ where: { id: row.userId }, data: { hasLivenessVideo: true } }),
      prisma.auditLog.create({
        data: {
          userId: row.userId,
          action: "kyc.video.baseline_ready",
          entity: "KycVideo",
          entityId: row.id,
          meta: { durationSec: result.durationSec },
        },
      }),
    ]);
    await logSecurityEvent({
      action: "kyc.video.baseline_ready",
      severity: "info",
      userId: row.userId,
      entity: "KycVideo",
      entityId: row.id,
      persist: false,
      meta: { durationSec: result.durationSec },
    });
    return;
  }

  // No usable face → FAILED + re-block so the user must record again.
  await prisma.$transaction([
    prisma.kycVideo.update({ where: { id: row.id }, data: { status: "FAILED" } }),
    prisma.user.update({ where: { id: row.userId }, data: { hasLivenessVideo: false } }),
    prisma.auditLog.create({
      data: {
        userId: row.userId,
        action: "kyc.video.baseline_failed",
        entity: "KycVideo",
        entityId: row.id,
        meta: { code: result.code, message: result.message },
      },
    }),
  ]);
  await logSecurityEvent({
    action: "kyc.video.baseline_failed",
    severity: "warn",
    userId: row.userId,
    entity: "KycVideo",
    entityId: row.id,
    persist: false,
    meta: { code: result.code },
  });
}
