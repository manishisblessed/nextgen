import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { nanoid } from "nanoid";
import { env, flags, isProd } from "../../env";
import { ekychubConfigured, faceRegister as hubFaceRegister } from "../../partners/ekychub";
import {
  uploadToCloudinary,
  signedDeliveryUrl,
  deleteFromCloudinary,
} from "../../cloudinary";

/**
 * Liveness video → face baseline pipeline (Phase 14), worker-side only.
 *
 * 1. ffprobe reads the true duration (authoritative duration gate).
 * 2. ffmpeg extracts ONE clear frame as a JPEG.
 * 3. The frame is registered with the eKYC Hub as the user's face baseline; the
 *    returned opaque reference is what we field-encrypt and store. The raw frame
 *    is handed to the provider out-of-band via a short-TTL signed URL and is
 *    never persisted in our DB.
 *
 * Live path (PARTNER_VERIFICATION_ENABLED + eKYC Hub creds): real provider call.
 * Simulated path (provider absent AND NODE_ENV !== "production"): deterministic
 * local stub so the whole capture → baseline → unblock cycle is testable without
 * external creds. In production the simulated path is refused.
 */

function faceLive(): boolean {
  return flags.verification && ekychubConfigured();
}

function assertSimulationAllowed(): void {
  if (isProd) {
    throw new Error(
      "[kyc.video] Face provider (eKYC Hub) is not configured. Set " +
        "PARTNER_VERIFICATION_ENABLED=true and EKYCHUB_USERNAME/EKYCHUB_API_TOKEN."
    );
  }
}

/** Run a binary, resolving stdout. Rejects on non-zero exit or spawn error. */
function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

export type ProbeResult = { durationSec: number };

/** Read the video's true duration via ffprobe. */
async function probeDuration(inputPath: string): Promise<ProbeResult> {
  const out = await run(env.FFPROBE_PATH || "ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  const durationSec = Math.round(Number(out));
  return { durationSec: Number.isFinite(durationSec) ? durationSec : 0 };
}

/** Extract one JPEG frame (sampled ~1s in, or mid-clip for very short videos). */
async function extractFrame(inputPath: string, durationSec: number, outPath: string): Promise<void> {
  const seek = durationSec > 2 ? 1 : Math.max(0, durationSec / 2);
  await run(env.FFMPEG_PATH || "ffmpeg", [
    "-y",
    "-ss",
    String(seek),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outPath,
  ]);
}

export type BaselineResult =
  | { ok: true; baselineRef: string; durationSec: number; faceDetected: true }
  | { ok: false; code: string; message: string; durationSec: number; faceDetected: false };

/**
 * Full worker pipeline: probe duration, extract a frame, register the baseline.
 * Returns the opaque (plaintext) provider reference — the caller field-encrypts
 * it before persisting. Cleans up all temp files and any provider-side frame.
 */
export async function buildFaceBaseline(input: {
  userId: string;
  videoBytes: Buffer;
  contentType: string;
  orderid: string;
}): Promise<BaselineResult> {
  const ext = input.contentType === "video/webm" ? "webm" : "mp4";
  const dir = await mkdtemp(join(tmpdir(), "kycvid-"));
  const inputPath = join(dir, `${randomUUID()}.${ext}`);
  const framePath = join(dir, `${randomUUID()}.jpg`);

  try {
    await writeFile(inputPath, input.videoBytes);
    const { durationSec } = await probeDuration(inputPath);
    await extractFrame(inputPath, durationSec, framePath);
    const frame = await readFile(framePath).catch(() => null);

    if (!frame || frame.byteLength < 1024) {
      // No usable frame produced → treat as "no face".
      return {
        ok: false,
        code: "NO_FACE_DETECTED",
        message: "No usable face frame could be extracted from the video.",
        durationSec,
        faceDetected: false,
      };
    }

    if (!faceLive()) {
      assertSimulationAllowed();
      // Dev simulation: a frame was extracted, so accept it as the baseline.
      return {
        ok: true,
        baselineRef: `SIMFACE_${nanoid(16)}`,
        durationSec,
        faceDetected: true,
      };
    }

    // Live: upload the frame privately, hand the provider a short-TTL signed URL,
    // register the baseline, then delete the staged frame.
    let publicId: string | null = null;
    try {
      const uploaded = await uploadToCloudinary(frame, {
        userId: input.userId,
        type: "SELFIE",
        isSensitive: true,
      });
      publicId = uploaded.public_id;
      const imageUrl = signedDeliveryUrl(publicId, { expiresInSec: 120, format: "jpg" });
      const res = await hubFaceRegister({ imageUrl, orderid: input.orderid });
      if (!res.ok) {
        return {
          ok: false,
          code: res.code || "FACE_REGISTER_FAILED",
          message: res.message || "Face baseline registration failed.",
          durationSec,
          faceDetected: false,
        };
      }
      if (res.data.face_detected === false) {
        return {
          ok: false,
          code: "NO_FACE_DETECTED",
          message: "No face was detected in the liveness video.",
          durationSec,
          faceDetected: false,
        };
      }
      return {
        ok: true,
        baselineRef: String(res.data.reference_id),
        durationSec,
        faceDetected: true,
      };
    } finally {
      // The staged frame is transient — the provider holds the canonical baseline.
      if (publicId) await deleteFromCloudinary(publicId, { isSensitive: true }).catch(() => {});
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
