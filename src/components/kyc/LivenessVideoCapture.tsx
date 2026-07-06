"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Loader2, CheckCircle2, Video, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Onboarding liveness video capture (Phase 14).
 *
 * Records a ~10-second clip while showing a server-issued liveness prompt, then
 * uploads it DIRECTLY to S3 via the presigned PUT URL (the bytes never touch our
 * app server) and calls /complete. Matches the existing capture UI language used
 * by the monthly re-KYC liveness step.
 */

const CAPTURE_SECONDS = 10;

type Phase = "consent" | "ready" | "recording" | "uploading" | "processing" | "done" | "error";

/** Choose a recorder MIME the browser supports, mapped to our allowed types. */
function pickMime(): { mime: string; contentType: "video/mp4" | "video/webm" } | null {
  const candidates: Array<{ mime: string; contentType: "video/mp4" | "video/webm" }> = [
    { mime: "video/webm;codecs=vp9", contentType: "video/webm" },
    { mime: "video/webm;codecs=vp8", contentType: "video/webm" },
    { mime: "video/webm", contentType: "video/webm" },
    { mime: "video/mp4", contentType: "video/mp4" },
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

export function LivenessVideoCapture({ onComplete, apiPrefix }: { onComplete?: () => void; apiPrefix?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("consent");
  const [consent, setConsent] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(CAPTURE_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const fail = useCallback(
    (msg: string) => {
      stopStream();
      setError(msg);
      setPhase("error");
    },
    [stopStream]
  );

  /** Step 1 → request camera, get presigned URL + prompt, begin recording. */
  async function begin() {
    setError(null);
    const picked = pickMime();
    if (!picked) {
      fail("Your browser does not support video recording. Try a modern browser.");
      return;
    }

    // 1. Get the presigned upload URL + liveness prompt (records consent server-side).
    let init: {
      uploadUrl: string;
      key: string;
      uploadToken: string;
      contentType: "video/mp4" | "video/webm";
      prompt: string;
      maxBytes: number;
      maxDurationSec: number;
    };
    try {
      const initiateUrl = apiPrefix ? `${apiPrefix}/video/initiate` : "/api/kyc/video/initiate";
      const res = await fetch(initiateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ consent: true, contentType: picked.contentType }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(typeof data.error === "string" ? data.error : "Could not start capture.");
        return;
      }
      init = data;
    } catch {
      fail("Network error starting capture. Please try again.");
      return;
    }

    setPrompt(init.prompt);

    // 2. Open the camera.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
    } catch {
      fail("Camera and microphone access are required for the liveness video.");
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play().catch(() => {});
    }

    // 3. Record for CAPTURE_SECONDS, then upload.
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: picked.mime });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: picked.contentType });
      void upload(blob, init);
    };

    setPhase("recording");
    setCountdown(CAPTURE_SECONDS);
    recorder.start();

    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          if (recorderRef.current?.state === "recording") recorderRef.current.stop();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  /** Upload the recorded blob to S3, then finalize via /complete. */
  async function upload(
    blob: Blob,
    init: { uploadUrl: string; key: string; uploadToken: string; contentType: string; maxBytes: number }
  ) {
    stopStream();
    setPhase("uploading");

    if (blob.size <= 0) {
      fail("Recording failed — no video was captured. Please try again.");
      return;
    }
    if (blob.size > init.maxBytes) {
      fail("The recording is too large. Please try again in better lighting.");
      return;
    }

    try {
      const put = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": init.contentType },
        body: blob,
      });
      if (!put.ok) {
        fail("Upload failed. Please try again.");
        return;
      }
    } catch {
      fail("Upload failed (network). Please try again.");
      return;
    }

    setPhase("processing");
    try {
      const completeUrl = apiPrefix ? `${apiPrefix}/video/complete` : "/api/kyc/video/complete";
      const res = await fetch(completeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          key: init.key,
          uploadToken: init.uploadToken,
          contentType: init.contentType,
          durationSec: CAPTURE_SECONDS,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(typeof data.error === "string" ? data.error : "Could not finalize your video.");
        return;
      }
      setPhase("done");
      onComplete?.();
    } catch {
      fail("Network error finalizing your video. Please try again.");
    }
  }

  function reset() {
    stopStream();
    chunksRef.current = [];
    setError(null);
    setPrompt(null);
    setCountdown(CAPTURE_SECONDS);
    setPhase("consent");
    setConsent(false);
  }

  return (
    <div className="space-y-5">
      {/* Camera viewport */}
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl border border-ink-200 bg-ink-900/90 shadow-soft">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        {phase === "recording" && (
          <>
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
            </div>
            <div className="absolute right-3 top-3 grid h-9 min-w-9 place-items-center rounded-full bg-ink-900/70 px-2 text-sm font-bold text-white">
              {countdown}s
            </div>
            {prompt && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/90 to-transparent p-4 pt-10">
                <p className="text-center text-sm font-semibold text-white">{prompt}</p>
              </div>
            )}
          </>
        )}

        {(phase === "consent" || phase === "ready" || phase === "error") && (
          <div className="absolute inset-0 grid place-items-center">
            <Video className="h-12 w-12 text-white/30" />
          </div>
        )}

        {(phase === "uploading" || phase === "processing") && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/70">
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-sm">
                {phase === "uploading" ? "Uploading securely…" : "Verifying your face…"}
              </p>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="absolute inset-0 grid place-items-center bg-emerald-600/90">
            <div className="flex flex-col items-center gap-2 text-white">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm font-semibold">Captured</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Controls */}
      {phase === "consent" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm leading-relaxed text-ink-600">
              I consent to recording a short liveness video for identity
              verification. I understand it is stored securely and used only to
              confirm my identity, in line with the platform&apos;s privacy and
              data-retention policy.
            </span>
          </label>
          <Button size="lg" className="w-full" disabled={!consent} onClick={begin}>
            <Camera className="h-4 w-4" /> Start 10-second capture
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Private &amp; encrypted. Never shared publicly.
          </p>
        </motion.div>
      )}

      {phase === "recording" && (
        <p className="text-center text-sm text-ink-500">
          Follow the on-screen instruction and keep your face centered.
        </p>
      )}

      {phase === "done" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
          Your liveness video is saved. We&apos;re finishing setting up your face
          baseline — your account will be ready to transact shortly.
        </div>
      )}

      {phase === "error" && (
        <Button variant="outline" size="lg" className="w-full" onClick={reset}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}
