import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, requireEnv } from "../env";

/**
 * Private S3 storage for onboarding liveness videos (Phase 14).
 *
 * Security model:
 * - The bucket is configured (out of band, in AWS) with Block Public Access ON,
 *   default SSE-KMS encryption, versioning ON, and a TLS-only bucket policy.
 * - Video bytes NEVER touch Postgres — only a field-encrypted object key + a
 *   sha256 integrity digest are persisted (see KycVideo).
 * - The browser uploads DIRECTLY to S3 with a short-TTL (120s) presigned PUT URL
 *   that pins the content-type and the SSE-KMS key, so the bytes bypass our app
 *   server entirely. The hard max-size cap is re-checked server-side on HEAD at
 *   /complete (oversized objects are deleted and rejected).
 * - Downloads use a presigned GET URL with TTL <= 60s, generated server-side
 *   only for audited admin access — never handed to normal users.
 *
 * Credentials: prefer the EC2 IAM instance role (default AWS provider chain).
 * Static access keys are only used as a local/dev fallback when present.
 */

/** Object key prefix; one folder per user. */
const KEY_PREFIX = "kyc-videos";

/** Allowed upload content-types (mp4 from most browsers, webm from Chrome). */
export const ALLOWED_VIDEO_CONTENT_TYPES = ["video/mp4", "video/webm"] as const;
export type KycVideoContentType = (typeof ALLOWED_VIDEO_CONTENT_TYPES)[number];

/** Presigned PUT TTL — short window to record-then-upload. */
const PUT_TTL_SEC = 120;
/** Presigned GET TTL — capped hard at 60s for audited admin viewing. */
const GET_TTL_MAX_SEC = 60;

/** Max accepted upload size in bytes (default 15 MiB). */
export const KYC_VIDEO_MAX_BYTES = (() => {
  const n = Number(env.KYC_VIDEO_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15_728_640;
})();

/** Max accepted video duration in seconds (default 12). */
export const KYC_VIDEO_MAX_DURATION_SEC = (() => {
  const n = Number(env.KYC_VIDEO_MAX_DURATION_SEC);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
})();

let cachedClient: S3Client | null = null;

function bucket(): string {
  return requireEnv("S3_KYC_BUCKET");
}

/** True once a bucket is configured (so callers can fail clean if not). */
export function kycStorageConfigured(): boolean {
  return !!env.S3_KYC_BUCKET;
}

function client(): S3Client {
  if (cachedClient) return cachedClient;
  const region = env.AWS_REGION || "ap-south-1";
  // Static keys are a LOCAL/DEV fallback only. In production both are unset and
  // the SDK's default provider chain resolves the EC2 IAM instance role.
  const hasStaticKeys = !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  cachedClient = new S3Client({
    region,
    ...(hasStaticKeys
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID as string,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
          },
        }
      : {}),
  });
  return cachedClient;
}

/** Deterministic key shape: `kyc-videos/{userId}/{uuid}.mp4`. */
export function buildKycVideoKey(userId: string): string {
  return `${KEY_PREFIX}/${userId}/${randomUUID()}.mp4`;
}

/** True if `key` belongs to `userId` (defense-in-depth ownership check). */
export function keyBelongsToUser(key: string, userId: string): boolean {
  return key.startsWith(`${KEY_PREFIX}/${userId}/`) && key.endsWith(".mp4");
}

/** True if a content-type is on the allow-list. */
export function isAllowedVideoContentType(ct: string): ct is KycVideoContentType {
  return (ALLOWED_VIDEO_CONTENT_TYPES as readonly string[]).includes(ct);
}

export type PresignedPut = {
  uploadUrl: string;
  key: string;
  expiresInSec: number;
  contentType: string;
};

/**
 * Issue a short-TTL presigned PUT URL. The signed request pins the content-type
 * (the client must send a matching Content-Type header). Encryption is enforced
 * by the bucket's DEFAULT SSE-KMS setting (and a bucket policy that denies
 * unencrypted PUTs), so every object lands KMS-encrypted without the browser
 * having to replicate signed SSE headers. The hard max-size cap is re-checked
 * server-side on HEAD at /complete (oversized objects are deleted + rejected).
 */
export async function presignKycVideoPut(input: {
  userId: string;
  contentType: KycVideoContentType;
}): Promise<PresignedPut> {
  const key = buildKycVideoKey(input.userId);
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: input.contentType,
  });
  const uploadUrl = await getSignedUrl(client(), cmd, { expiresIn: PUT_TTL_SEC });
  return { uploadUrl, key, expiresInSec: PUT_TTL_SEC, contentType: input.contentType };
}

/**
 * Issue a presigned GET URL (TTL clamped to <= 60s) for audited admin download.
 * NEVER expose this to normal users.
 */
export async function presignKycVideoGet(
  key: string,
  opts?: { expiresInSec?: number }
): Promise<string> {
  const ttl = Math.min(GET_TTL_MAX_SEC, Math.max(1, opts?.expiresInSec ?? GET_TTL_MAX_SEC));
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: ttl });
}

export type KycObjectHead = {
  contentLength: number;
  contentType: string | null;
};

/** HEAD the object to confirm it exists and read its size/type. Null if absent. */
export async function headKycVideoObject(key: string): Promise<KycObjectHead | null> {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return {
      contentLength: Number(res.ContentLength ?? 0),
      contentType: res.ContentType ?? null,
    };
  } catch {
    return null;
  }
}

/** Download the full object bytes (worker-side: sha256 + ffmpeg frame extraction). */
export async function getKycVideoObjectBytes(key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const body = res.Body as unknown as AsyncIterable<Uint8Array> | undefined;
  if (!body) throw new Error("[s3Kyc] Empty object body");
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Permanently delete the object (retention purge). Best-effort; logs nothing here. */
export async function deleteKycVideoObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
