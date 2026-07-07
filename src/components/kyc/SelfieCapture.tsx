"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CameraPermissionGuide } from "@/components/kyc/CameraPermissionGuide";
import {
  getMediaPermissionState,
  watchMediaPermissions,
  type MediaPermissionState,
} from "@/lib/mediaPermissions";

/**
 * Live selfie capture using the FRONT camera (facingMode: "user").
 *
 * Primary path drives the front camera via getUserMedia (a plain
 * <input capture="user"> is unreliable on Android — many devices open the
 * rear camera). PERMANENT FALLBACK: a native <input capture> that opens the
 * phone's camera app directly — it needs no web camera permission, so it
 * works even when the site is blocked or the page runs inside a WebView.
 */

type Phase = "idle" | "starting" | "preview" | "captured" | "error";

/**
 * Downscale/re-encode a camera-app photo to JPEG under the 5 MiB selfie
 * limit (phone camera photos are often 8–15 MB).
 */
async function toJpegUnderLimit(file: File, maxDim = 1600): Promise<File> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode failed"));
      };
      img.src = url;
    });
  }

  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!w || !h) throw new Error("empty image");

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new Error("encode failed");
  return new File([blob], `selfie_${Date.now()}.jpg`, { type: "image/jpeg" });
}

export function SelfieCapture({
  uploaded,
  uploading,
  onCapture,
}: {
  uploaded: boolean;
  uploading: boolean;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [processingFile, setProcessingFile] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"permission" | "generic">("generic");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [permState, setPermState] = useState<MediaPermissionState>("unknown");

  const refreshPermState = useCallback(async () => {
    const s = await getMediaPermissionState({ audio: false });
    setPermState(s);
    return s;
  }, []);

  // Probe up front so we can prime the user (or guide them if it's blocked).
  useEffect(() => {
    void refreshPermState();
  }, [refreshPermState]);

  // Auto-recover: if the user unblocks the camera in browser settings while
  // our "blocked" guide is showing, open the camera without a manual retry.
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const errorKindRef = useRef(errorKind);
  errorKindRef.current = errorKind;
  const startRef = useRef<() => Promise<void>>();

  useEffect(() => {
    return watchMediaPermissions({ audio: false }, (s) => {
      setPermState(s);
      if (
        s === "granted" &&
        phaseRef.current === "error" &&
        errorKindRef.current === "permission"
      ) {
        void startRef.current?.();
      }
    });
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stop();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [stop]);

  function failWith(msg: string, kind: "permission" | "generic" = "generic") {
    setError(msg);
    setErrorKind(kind);
    setPhase("error");
  }

  async function start() {
    setError(null);
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        failWith("This browser can't access the camera. Please open the link in Chrome or Safari.");
        return;
      }
      // If already blocked, show the fix guide instead of a futile attempt.
      const pre = await refreshPermState();
      if (pre === "denied") {
        failWith("Camera permission is blocked.", "permission");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("preview");
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        failWith("Camera permission is blocked.", "permission");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        failWith("No camera was found on this device.");
      } else if (name === "NotReadableError") {
        failWith("Your camera is being used by another app. Close it and try again.");
      } else {
        failWith("Couldn't open the camera. Please try again.");
      }
    }
  }
  startRef.current = start;

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror so the saved selfie matches the preview the user sees.
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Capture failed. Please try again.");
          return;
        }
        stop();
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPhase("captured");
        const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  }

  function retake() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    start();
  }

  /**
   * Fallback path: photo taken with the phone's native camera app via
   * <input capture>. Works with zero web camera permissions.
   */
  async function handleNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!raw) return;

    setProcessingFile(true);
    setError(null);
    try {
      const file = await toJpegUnderLimit(raw);
      stop();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPhase("captured");
      onCapture(file);
    } catch {
      failWith("Couldn't read that photo. Please try taking it again.");
    } finally {
      setProcessingFile(false);
    }
  }

  const showCameraViewport = phase === "starting" || phase === "preview";
  const showPreviewImage = phase === "captured" && previewUrl;

  return (
    <div
      className={`rounded-xl border p-4 ${
        uploaded ? "border-emerald-200 bg-emerald-50" : "border-ink-200 bg-white"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {uploaded ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <Camera className="h-5 w-5 text-ink-400" />
        )}
        <p className="text-sm font-medium text-ink-900">
          Live Selfie Photo <span className="text-rose-500">*</span>
        </p>
      </div>

      {/* Viewport / preview */}
      {(showCameraViewport || showPreviewImage) && (
        <div className="relative mx-auto mb-3 aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-ink-200 bg-ink-900/90">
          {showCameraViewport && (
            <video
              ref={videoRef}
              className="h-full w-full -scale-x-100 object-cover"
              muted
              playsInline
            />
          )}
          {showPreviewImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl!} alt="Selfie preview" className="h-full w-full object-cover" />
          )}
          {phase === "starting" && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/60">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
          )}
          {uploading && showPreviewImage && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/60">
              <div className="flex flex-col items-center gap-2 text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-xs">Uploading…</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {((phase === "error" && errorKind === "permission") ||
        (phase === "idle" && permState === "denied")) && (
        <div className="mb-3 space-y-3">
          {/* Zero-permission escape hatch — always works, even in WebViews. */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 text-xs text-emerald-800">
              <strong>No problem —</strong> you can take the selfie with your
              phone&apos;s camera app instead. No browser permission needed.
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={processingFile}
              onClick={() => fileInputRef.current?.click()}
            >
              {processingFile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Take Selfie with Camera App
            </Button>
          </div>
          <CameraPermissionGuide withMic={false} />
        </div>
      )}

      {/* Priming: set expectations before the browser's permission prompt. */}
      {!uploaded && phase === "idle" && permState !== "denied" && permState !== "granted" && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-xs text-ink-600">
          <Camera className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          <span>
            When you tap below, your browser will ask to use the{" "}
            <strong>camera</strong>. Please tap <strong>Allow</strong> to take your
            live selfie.
          </span>
        </div>
      )}

      {/* Native camera-app input (front camera hint via capture="user"). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleNativeFile}
      />

      {/* Controls */}
      {uploaded ? (
        <p className="text-xs text-emerald-700">Selfie uploaded successfully</p>
      ) : phase === "idle" || phase === "error" ? (
        <div className="space-y-2">
          <Button type="button" onClick={start} className="w-full">
            <Camera className="h-4 w-4" />
            {phase === "error" ? "Try again" : "Open Front Camera"}
          </Button>
          <button
            type="button"
            disabled={processingFile}
            onClick={() => fileInputRef.current?.click()}
            className="mx-auto flex items-center gap-1.5 text-center text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
          >
            {processingFile ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            Camera not opening? Use your phone&apos;s camera app
          </button>
        </div>
      ) : phase === "preview" ? (
        <Button type="button" onClick={capture} className="w-full">
          <Camera className="h-4 w-4" /> Capture Selfie
        </Button>
      ) : phase === "captured" ? (
        <button
          type="button"
          onClick={retake}
          disabled={uploading}
          className="mx-auto flex items-center gap-1.5 text-center text-sm text-brand-600 hover:underline disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Retake
        </button>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
        </div>
      )}
    </div>
  );
}
