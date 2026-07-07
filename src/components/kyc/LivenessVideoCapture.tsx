"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Loader2, CheckCircle2, Video, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CameraPermissionGuide } from "@/components/kyc/CameraPermissionGuide";
import {
  getMediaPermissionState,
  watchMediaPermissions,
  type MediaPermissionState,
} from "@/lib/mediaPermissions";

/**
 * Onboarding liveness video capture (Phase 14).
 *
 * Records a ~10-second clip while showing a server-issued liveness prompt, then
 * uploads it DIRECTLY to S3 via the presigned PUT URL (the bytes never touch our
 * app server) and calls /complete. Matches the existing capture UI language used
 * by the monthly re-KYC liveness step.
 */

const CAPTURE_SECONDS = 10;

type Phase =
  | "consent"
  | "ready"
  | "starting"
  | "recording"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "fallback";

/** Read a recorded file's duration (seconds) via a detached <video> element. */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("consent");
  const [consent, setConsent] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [challengeCode, setChallengeCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(CAPTURE_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"permission" | "generic">("generic");
  const [permState, setPermState] = useState<MediaPermissionState>("unknown");
  const [fallbackMaxBytes, setFallbackMaxBytes] = useState(15_728_640);
  const [processingFile, setProcessingFile] = useState(false);

  const refreshPermState = useCallback(async () => {
    const s = await getMediaPermissionState({ audio: true });
    setPermState(s);
    return s;
  }, []);

  // Probe the current permission state up front so we can prime (or guide) the
  // user before they tap — like a bank vKYC flow.
  useEffect(() => {
    void refreshPermState();
  }, [refreshPermState]);

  // Auto-recover: if the user unblocks camera/mic in browser settings while
  // our "blocked" guide is showing, clear the error so they can start right
  // away (we don't auto-record — consent + the 10s countdown need a tap).
  const phaseRef = useRef<Phase>("consent");
  phaseRef.current = phase;
  const errorKindRef = useRef(errorKind);
  errorKindRef.current = errorKind;

  useEffect(() => {
    return watchMediaPermissions({ audio: true }, (s) => {
      setPermState(s);
      if (
        s === "granted" &&
        phaseRef.current === "error" &&
        errorKindRef.current === "permission"
      ) {
        setError(null);
        setPhase("consent");
      }
    });
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const fail = useCallback(
    (msg: string, kind: "permission" | "generic" = "generic") => {
      stopStream();
      setError(msg);
      setErrorKind(kind);
      setPhase("error");
    },
    [stopStream]
  );

  /** Step 1 → request camera, get presigned URL + prompt, begin recording. */
  async function begin() {
    setError(null);
    const picked = pickMime();
    if (!picked) {
      fail("Your browser doesn't support in-app video recording. Please use the latest Chrome or Safari.");
      return;
    }

    // If the browser already reports the permission as blocked, don't bother
    // firing getUserMedia (it would throw instantly) — show the fix guide now.
    const pre = await refreshPermState();
    if (pre === "denied") {
      fail("Camera & microphone permission is blocked.", "permission");
      return;
    }

    // 1. Open the front camera + mic FIRST — this makes the permission prompt
    //    appear immediately on the button tap (best user-gesture association).
    //    Retry with relaxed constraints so a fussy device still works.
    setPhase("starting");
    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("This browser can't access the camera. Please open the link in Chrome or Safari.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" } },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("Camera & microphone permission is blocked.", "permission");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        fail("No camera or microphone was found on this device.");
      } else if (name === "NotReadableError") {
        fail("Your camera is being used by another app. Close it and try again.");
      } else {
        fail("Camera and microphone access are required for the liveness video.");
      }
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play().catch(() => {});
    }

    // 2. Get the presigned upload URL + challenge code (records consent server-side).
    let init: {
      uploadUrl: string;
      key: string;
      uploadToken: string;
      contentType: "video/mp4" | "video/webm";
      prompt: string;
      challengeCode?: string;
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
        fail(typeof data.error === "string" ? data.error : "Could not start capture. Please try again.");
        return;
      }
      init = data;
    } catch {
      fail("Network error starting capture. Please try again.");
      return;
    }

    setPrompt(init.prompt);
    setChallengeCode(init.challengeCode ?? null);

    // 3. Record for CAPTURE_SECONDS, then upload. Use a timeslice so data is
    //    flushed periodically (some mobile browsers only emit on stop).
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: picked.mime });
    } catch {
      // Some devices reject the explicit mimeType — let the browser choose.
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: picked.contentType });
      void upload(blob, init);
    };
    recorder.onerror = () => {
      fail("Recording failed on this device. Please try again.");
    };

    setPhase("recording");
    setCountdown(CAPTURE_SECONDS);
    try {
      recorder.start(1000);
    } catch {
      fail("Couldn't start the recorder. Please try again.");
      return;
    }

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

  /**
   * PERMANENT FALLBACK — no getUserMedia involved. Fetches the liveness
   * challenge code, shows it on screen, then lets the user record with the
   * phone's NATIVE camera app via <input capture>. Works even when the site's
   * camera permission is blocked or the page runs inside a WebView.
   */
  async function beginFallback() {
    setError(null);
    try {
      const initiateUrl = apiPrefix ? `${apiPrefix}/video/initiate` : "/api/kyc/video/initiate";
      const res = await fetch(initiateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ consent: true, contentType: "video/mp4" }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(typeof data.error === "string" ? data.error : "Could not start capture. Please try again.");
        return;
      }
      setPrompt(data.prompt ?? null);
      setChallengeCode(data.challengeCode ?? null);
      setFallbackMaxBytes(data.maxBytes ?? 15_728_640);
      setPhase("fallback");
    } catch {
      fail("Network error starting capture. Please try again.");
    }
  }

  /** Validate the camera-app recording, then presign fresh and upload. */
  async function handleNativeVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking again after a validation error
    if (!file) return;

    setProcessingFile(true);
    setError(null);
    try {
      if (file.size > fallbackMaxBytes) {
        setError(
          "That video file is too large. Please record a shorter clip (about 10 seconds) — lowering the camera resolution also helps."
        );
        return;
      }

      const rawDuration = await readVideoDuration(file);
      const durationSec = Math.round(rawDuration ?? CAPTURE_SECONDS);
      if (rawDuration !== null && durationSec > 15) {
        setError("The video is too long. Please record about 10 seconds only.");
        return;
      }
      if (rawDuration !== null && durationSec < 5) {
        setError("The video is too short. Please record at least 5 seconds while reading the number aloud.");
        return;
      }

      // Re-initiate for a FRESH presigned URL + upload token — the one from
      // beginFallback() may have expired while the user was recording.
      const initiateUrl = apiPrefix ? `${apiPrefix}/video/initiate` : "/api/kyc/video/initiate";
      const res = await fetch(initiateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ consent: true, contentType: "video/mp4" }),
      });
      const init = await res.json();
      if (!res.ok) {
        fail(typeof init.error === "string" ? init.error : "Could not start the upload. Please try again.");
        return;
      }

      await upload(
        file,
        // Keep the challenge code the user actually read aloud on camera.
        { ...init, challengeCode: challengeCode ?? init.challengeCode },
        Math.min(15, Math.max(5, durationSec))
      );
    } catch {
      setError("Couldn't read that video. Please try recording again.");
    } finally {
      setProcessingFile(false);
    }
  }

  /** Upload the recorded blob to S3, then finalize via /complete. */
  async function upload(
    blob: Blob,
    init: { uploadUrl: string; key: string; uploadToken: string; contentType: string; maxBytes: number; challengeCode?: string },
    durationSec: number = CAPTURE_SECONDS
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

    // Upload to S3 with one automatic retry (covers transient network drops).
    let uploaded = false;
    for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
      try {
        const put = await fetch(init.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": init.contentType },
          body: blob,
        });
        if (put.ok) {
          uploaded = true;
        } else if (attempt === 1) {
          fail(`Upload failed (HTTP ${put.status}). Please try again.`);
          return;
        }
      } catch {
        // A thrown fetch on a cross-origin PUT is typically a CORS/network issue.
        if (attempt === 1) {
          fail("Upload failed — network or storage error. Please check your connection and try again.");
          return;
        }
      }
      if (!uploaded) await new Promise((r) => setTimeout(r, 800));
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
          durationSec,
          challengeCode: init.challengeCode,
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
    setChallengeCode(null);
    setCountdown(CAPTURE_SECONDS);
    setPhase("consent");
    setConsent(false);
    void refreshPermState();
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
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/95 to-transparent p-4 pt-12">
              {challengeCode ? (
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/80">
                    Read this number aloud
                  </p>
                  <p className="mt-1 text-3xl font-black tracking-[0.35em] text-white drop-shadow">
                    {challengeCode}
                  </p>
                </div>
              ) : (
                prompt && (
                  <p className="text-center text-sm font-semibold text-white">{prompt}</p>
                )
              )}
            </div>
          </>
        )}

        {(phase === "consent" || phase === "ready" || phase === "error" || phase === "fallback") && (
          <div className="absolute inset-0 grid place-items-center">
            <Video className="h-12 w-12 text-white/30" />
          </div>
        )}

        {phase === "starting" && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/70">
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
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

      {phase === "error" && errorKind === "permission" && (
        <div className="space-y-3">
          {/* Zero-permission escape hatch — always works, even in WebViews. */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-2 text-sm text-emerald-800">
              <strong>No problem —</strong> record the 10-second video with your
              phone&apos;s camera app instead. No browser permission needed.
            </p>
            <Button type="button" className="w-full" onClick={beginFallback}>
              <Video className="h-4 w-4" /> Record with Camera App
            </Button>
          </div>
          <CameraPermissionGuide withMic />
        </div>
      )}

      {/* Hidden native camera-app input (front camera hint via capture). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        capture="user"
        className="hidden"
        onChange={handleNativeVideo}
      />

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
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-3 text-center text-xs text-brand-700">
            When recording starts, a <strong>4-digit number</strong> will appear on
            screen. Please <strong>read it aloud</strong> clearly while looking at
            the camera.
          </div>

          {/* Priming: tell the user what to expect before the browser prompt. */}
          {permState !== "denied" && permState !== "granted" && (
            <div className="flex items-start gap-2 rounded-2xl border border-ink-100 bg-ink-50/60 p-3 text-xs text-ink-600">
              <Camera className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <span>
                When you tap start, your browser will ask to use the{" "}
                <strong>camera and microphone</strong>. Please tap{" "}
                <strong>Allow</strong> to continue.
              </span>
            </div>
          )}

          {/* Proactive guidance if the browser already reports it as blocked. */}
          {permState === "denied" && (
            <div className="space-y-2">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                Camera &amp; microphone access is currently <strong>blocked</strong>{" "}
                for this site. Use your phone&apos;s camera app below (no permission
                needed), or re-enable access and tap start.
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <Button
                  type="button"
                  className="w-full"
                  disabled={!consent}
                  onClick={beginFallback}
                >
                  <Video className="h-4 w-4" /> Record with Camera App
                </Button>
                {!consent && (
                  <p className="mt-1.5 text-center text-[11px] text-emerald-700">
                    Tick the consent box above first.
                  </p>
                )}
              </div>
              <CameraPermissionGuide withMic />
            </div>
          )}

          <Button size="lg" className="w-full" disabled={!consent} onClick={begin}>
            <Camera className="h-4 w-4" /> Start 10-second capture
          </Button>
          <button
            type="button"
            disabled={!consent}
            onClick={beginFallback}
            className="mx-auto flex items-center gap-1.5 text-center text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
          >
            <Video className="h-3.5 w-3.5" /> Camera not opening? Record with your phone&apos;s camera app
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Private &amp; encrypted. Never shared publicly.
          </p>
        </motion.div>
      )}

      {phase === "recording" && (
        <p className="text-center text-sm text-ink-500">
          Keep your face centered and clearly read the number shown aloud.
        </p>
      )}

      {phase === "fallback" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
              Remember this number — read it aloud in your video
            </p>
            <p className="mt-1 text-4xl font-black tracking-[0.35em] text-brand-800">
              {challengeCode ?? "— — — —"}
            </p>
          </div>

          <ol className="ml-4 list-decimal space-y-1.5 text-sm text-ink-600">
            <li>Tap the button below — your phone&apos;s camera app will open.</li>
            <li>
              Switch to the <strong>front (selfie) camera</strong> and record
              about <strong>10 seconds</strong> with your face centered.
            </li>
            <li>
              Clearly <strong>read the number above aloud</strong> while recording.
            </li>
            <li>Tap Done / OK in the camera app — the upload starts automatically.</li>
          </ol>

          <Button
            size="lg"
            className="w-full"
            disabled={processingFile}
            onClick={() => fileInputRef.current?.click()}
          >
            {processingFile ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Checking video…
              </>
            ) : (
              <>
                <Video className="h-4 w-4" /> Open Camera App & Record
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={reset}
            className="mx-auto block text-center text-xs text-ink-400 hover:underline"
          >
            ← Back
          </button>
        </motion.div>
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
