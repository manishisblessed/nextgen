"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, CheckCircle2, RefreshCw, MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CameraPermissionGuide } from "@/components/kyc/CameraPermissionGuide";
import { extractGpsFromFile } from "@/lib/gps";
import {
  getMediaPermissionState,
  watchMediaPermissions,
  type MediaPermissionState,
} from "@/lib/mediaPermissions";

/**
 * Live GPS-tagged photo capture (Phase 15).
 *
 * Unlike a plain file upload, this component drives the camera via
 * getUserMedia and reads the device's geolocation AT THE MOMENT the shutter
 * is pressed, so the coordinates provably belong to the capture event and
 * can't be spoofed by uploading an old photo. The captured fix (lat/lng,
 * accuracy, timestamp) rides along with the file to the server, which also
 * records the client IP.
 *
 * PERMANENT FALLBACK: a native <input capture> that opens the phone's camera
 * app. On that path we still take a live browser geolocation fix when the
 * photo comes back, and fall back to the photo's EXIF GPS as a last resort.
 */

export type GpsCapture = {
  latitude: number;
  longitude: number;
  /** Reported accuracy radius in meters (browser fix only). */
  accuracy?: number;
  /** ISO timestamp of the fix. */
  capturedAt: string;
  /** How the fix was obtained. */
  source: "browser" | "exif";
};

type Phase = "idle" | "starting" | "preview" | "locating" | "captured" | "error";

function getBrowserPosition(timeoutMs = 20000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation-unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 15000,
    });
  });
}

/** Downscale/re-encode a camera-app photo to JPEG (phone photos are often 8–15 MB). */
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
  return new File([blob], `gps_photo_${Date.now()}.jpg`, { type: "image/jpeg" });
}

export function GpsPhotoCapture({
  label,
  description,
  required = true,
  uploaded,
  uploading,
  facing = "environment",
  onCapture,
}: {
  label: string;
  description?: string;
  required?: boolean;
  uploaded: boolean;
  uploading: boolean;
  /** "environment" = rear camera (premises photos), "user" = front (selfie). */
  facing?: "environment" | "user";
  onCapture: (file: File, gps: GpsCapture) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [processingFile, setProcessingFile] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"permission" | "location" | "generic">("generic");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [permState, setPermState] = useState<MediaPermissionState>("unknown");
  const [gpsFix, setGpsFix] = useState<GpsCapture | null>(null);

  const mirrored = facing === "user";

  const refreshPermState = useCallback(async () => {
    const s = await getMediaPermissionState({ audio: false });
    setPermState(s);
    return s;
  }, []);

  useEffect(() => {
    void refreshPermState();
  }, [refreshPermState]);

  // Auto-recover when the user unblocks the camera in browser settings.
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

  function failWith(msg: string, kind: "permission" | "location" | "generic" = "generic") {
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
      const pre = await refreshPermState();
      if (pre === "denied") {
        failWith("Camera permission is blocked.", "permission");
        return;
      }
      // Warm up the location fix in parallel — most devices need a few
      // seconds for a first GPS lock, so ask while the camera opens.
      void getBrowserPosition().catch(() => {});
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
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

  function locationErrorMessage(err: unknown): { msg: string; kind: "location" } {
    const code = (err as GeolocationPositionError)?.code;
    if (code === 1) {
      return {
        msg: "Location permission was denied. Please allow location access for this site (tap the lock icon in the address bar) and try again — the GPS tag is mandatory for this photo.",
        kind: "location",
      };
    }
    if (code === 3) {
      return {
        msg: "Couldn't get a GPS lock in time. Move near a window or outdoors, make sure Location is ON, and try again.",
        kind: "location",
      };
    }
    return {
      msg: "Couldn't read your location. Make sure Location/GPS is turned ON for your device and browser, then try again.",
      kind: "location",
    };
  }

  /** Shutter press: freeze the frame, then take a live geolocation fix. */
  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) {
      setError("Capture failed. Please try again.");
      return;
    }

    setPhase("locating");
    setError(null);
    let gps: GpsCapture;
    try {
      const pos = await getBrowserPosition();
      gps = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        source: "browser",
      };
    } catch (err) {
      // Photo is discarded — GPS is mandatory; camera preview stays live.
      const { msg, kind } = locationErrorMessage(err);
      setError(msg);
      setErrorKind(kind);
      setPhase("preview");
      return;
    }

    stop();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setGpsFix(gps);
    setPhase("captured");
    const file = new File([blob], `gps_photo_${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file, gps);
  }

  function retake() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setGpsFix(null);
    start();
  }

  /**
   * Fallback: photo from the phone's native camera app. Still take a LIVE
   * browser location fix; EXIF GPS is only a last resort.
   */
  async function handleNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;

    setProcessingFile(true);
    setError(null);
    try {
      const file = await toJpegUnderLimit(raw);

      let gps: GpsCapture | null = null;
      try {
        const pos = await getBrowserPosition();
        gps = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
          source: "browser",
        };
      } catch {
        // Re-encoding strips EXIF, so read GPS from the ORIGINAL file.
        const exif = await extractGpsFromFile(raw);
        if (exif) {
          gps = {
            latitude: exif.latitude,
            longitude: exif.longitude,
            capturedAt: new Date(raw.lastModified || Date.now()).toISOString(),
            source: "exif",
          };
        }
      }

      if (!gps) {
        failWith(
          "This photo needs a GPS location. Please allow location access for this site (or enable location tagging in your camera app) and try again.",
          "location"
        );
        return;
      }

      stop();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setGpsFix(gps);
      setPhase("captured");
      onCapture(file, gps);
    } catch {
      failWith("Couldn't read that photo. Please try taking it again.");
    } finally {
      setProcessingFile(false);
    }
  }

  const showCameraViewport = phase === "starting" || phase === "preview" || phase === "locating";
  const showPreviewImage = phase === "captured" && previewUrl;

  return (
    <div
      className={`rounded-xl border p-4 ${
        uploaded ? "border-emerald-200 bg-emerald-50" : "border-ink-200 bg-white"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        {uploaded ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <FileText className="h-5 w-5 shrink-0 text-ink-400" />
        )}
        <p className="text-sm font-medium text-ink-900">
          {label}{" "}
          {required ? (
            <span className="text-rose-500">*</span>
          ) : (
            <span className="text-xs text-ink-400">(Optional)</span>
          )}
          <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            <MapPin className="h-2.5 w-2.5" /> GPS
          </span>
        </p>
      </div>
      {description && !uploaded && (
        <p className="mb-2 pl-7 text-xs text-ink-500">{description}</p>
      )}

      {/* Viewport / preview */}
      {(showCameraViewport || showPreviewImage) && (
        <div className="relative mx-auto my-3 aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-ink-200 bg-ink-900/90">
          {showCameraViewport && (
            <video
              ref={videoRef}
              className={`h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
              muted
              playsInline
            />
          )}
          {showPreviewImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl!} alt={`${label} preview`} className="h-full w-full object-cover" />
          )}
          {phase === "starting" && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/60">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
          )}
          {phase === "locating" && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/60">
              <div className="flex flex-col items-center gap-2 text-white">
                <MapPin className="h-6 w-6 animate-pulse" />
                <p className="text-xs">Getting your location…</p>
              </div>
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

      {/* Captured location proof */}
      {gpsFix && (phase === "captured" || uploaded) && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>
            Location captured: {gpsFix.latitude.toFixed(5)}, {gpsFix.longitude.toFixed(5)}
            {gpsFix.accuracy ? ` (±${gpsFix.accuracy}m)` : ""}
          </span>
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
          {/* Zero-permission escape hatch — works even in WebViews. */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 text-xs text-emerald-800">
              <strong>No problem —</strong> you can take the photo with your
              phone&apos;s camera app instead. Location must still be enabled.
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
              Take Photo with Camera App
            </Button>
          </div>
          <CameraPermissionGuide withMic={false} />
        </div>
      )}

      {/* Priming: set expectations before the permission prompts. */}
      {!uploaded && phase === "idle" && permState !== "denied" && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-xs text-ink-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          <span>
            This photo must be taken <strong>live</strong>. Your browser will ask
            for <strong>camera</strong> and <strong>location</strong> access —
            please tap <strong>Allow</strong> for both. Your location is recorded
            at the moment you take the photo.
          </span>
        </div>
      )}

      {/* Native camera-app input. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture={facing}
        className="hidden"
        onChange={handleNativeFile}
      />

      {/* Controls */}
      {uploaded ? (
        <p className="text-xs text-emerald-700">Uploaded successfully</p>
      ) : phase === "idle" || phase === "error" ? (
        <div className="space-y-2">
          <Button type="button" onClick={start} className="w-full">
            <Camera className="h-4 w-4" />
            {phase === "error" ? "Try again" : "Take Live Photo"}
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
          <Camera className="h-4 w-4" /> Capture Photo
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
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase === "locating" ? "Getting location…" : "Starting camera…"}
        </div>
      )}
    </div>
  );
}
