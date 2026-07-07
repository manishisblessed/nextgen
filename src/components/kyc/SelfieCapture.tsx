"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Live selfie capture using the FRONT camera (facingMode: "user").
 *
 * A plain <input capture="user"> is unreliable on Android (many devices open
 * the rear camera), so we drive the front camera directly via getUserMedia and
 * grab a still frame. Falls back to a file picker if the camera is unavailable.
 */

type Phase = "idle" | "starting" | "preview" | "captured" | "error";

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

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"permission" | "generic">("generic");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

      {phase === "error" && errorKind === "permission" && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">How to enable the camera</p>
          <div className="mt-1.5 space-y-1.5">
            <div>
              <p className="font-medium">Android (Chrome):</p>
              <ol className="ml-4 list-decimal space-y-0.5">
                <li>Tap the <strong>lock / tune icon</strong> left of the address bar.</li>
                <li>Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).</li>
                <li>Set <strong>Camera</strong> to <strong>Allow</strong> (or tap <strong>Reset permissions</strong>).</li>
                <li>Reload the page and tap <strong>Try again</strong>.</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">iPhone (Safari):</p>
              <ol className="ml-4 list-decimal space-y-0.5">
                <li>Tap <strong>aA</strong> in the address bar → <strong>Website Settings</strong>.</li>
                <li>Set <strong>Camera</strong> to <strong>Allow</strong>.</li>
                <li>Reload the page and tap <strong>Try again</strong>.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      {uploaded ? (
        <p className="text-xs text-emerald-700">Selfie uploaded successfully</p>
      ) : phase === "idle" || phase === "error" ? (
        <Button type="button" onClick={start} className="w-full">
          <Camera className="h-4 w-4" />
          {phase === "error" ? "Try again" : "Open Front Camera"}
        </Button>
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
