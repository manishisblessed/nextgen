"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  ArrowRight,
  Loader2,
  Camera,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

type Method = "aadhaar_otp" | "face_match" | "aadhaar_otp+face";

type Status = {
  reKycRequired: boolean;
  reKycDueAt: string | null;
  lastReKycAt: string | null;
  isNetworkTier: boolean;
  method: Method;
};

type Step = "loading" | "verified" | "intro" | "aadhaar" | "otp" | "face" | "submitting" | "done";

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ReKycPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);

  // Flow state
  const [aadhaar, setAadhaar] = useState("");
  const [otp, setOtp] = useState("");
  const [faceProbeRef, setFaceProbeRef] = useState<string | null>(null);
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [stepUpCode, setStepUpCode] = useState("");
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requiresOtp = status?.method === "aadhaar_otp" || status?.method === "aadhaar_otp+face";
  const requiresFace = status?.method === "face_match" || status?.method === "aadhaar_otp+face";

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/rekyc/status");
      const data: Status = await res.json();
      setStatus(data);
      if (!data.isNetworkTier) {
        router.replace("/dashboard");
        return;
      }
      setStep(data.reKycRequired ? "intro" : "verified");
    } catch {
      setError("Could not load your verification status.");
    }
  }, [router]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function initiate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rekyc/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(requiresOtp ? { aadhaar } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not start verification.");
        return;
      }
      // Advance to whichever proof we still need to collect.
      if (requiresOtp) setStep("otp");
      else setStep("face");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(extraStepUp?: string) {
    setStep("submitting");
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (requiresOtp) body.otp = otp;
      if (requiresFace && faceProbeRef) body.faceProbeRef = faceProbeRef;
      const code = extraStepUp ?? (needsStepUp ? stepUpCode : undefined);
      if (code) body.stepUpCode = code;

      const res = await fetch("/api/rekyc/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        setNextDue(data.reKycDueAt ?? null);
        setStep("done");
        return;
      }

      // Step-up required → reveal the 2FA field and let the user resubmit.
      if (data.stepUp || data.code === "STEP_UP_REQUIRED" || data.code === "STEP_UP_INVALID") {
        setNeedsStepUp(true);
        setError(data.error || "Enter your two-factor code to continue.");
        setStep(requiresFace && !requiresOtp ? "face" : "otp");
        return;
      }

      setError(typeof data.error === "string" ? data.error : "Verification failed.");
      setStep(requiresFace && !requiresOtp ? "face" : "otp");
    } catch {
      setError("Network error. Please try again.");
      setStep(requiresFace && !requiresOtp ? "face" : "otp");
    } finally {
      setBusy(false);
    }
  }

  // After OTP entry: go to face capture if needed, else verify.
  function afterOtp() {
    if (requiresFace) setStep("face");
    else submitVerify();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Monthly identity re-verification"
        description="A quick monthly check that confirms only you are operating this account. Your transactions resume the moment it's complete."
      />

      <div className="mx-auto w-full max-w-lg">
        <AnimatePresence mode="wait">
          {step === "loading" && (
            <Centered key="loading">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              <p className="text-sm text-ink-500">Checking your status…</p>
            </Centered>
          )}

          {step === "verified" && (
            <Card key="verified" tone="emerald">
              <IconBubble tone="emerald">
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
              </IconBubble>
              <h2 className="text-xl font-bold text-ink-900">You&apos;re verified this month</h2>
              <p className="text-sm text-ink-500">
                {status?.reKycDueAt
                  ? `Your next re-verification is due ${fmtDate(status.reKycDueAt)}.`
                  : "No action needed right now."}
              </p>
              <Button className="mx-auto" onClick={() => router.push("/dashboard")}>
                Back to dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          )}

          {step === "intro" && (
            <Card key="intro" tone="amber">
              <IconBubble tone="amber">
                <ShieldAlert className="h-8 w-8 text-amber-600" />
              </IconBubble>
              <h2 className="text-xl font-bold text-ink-900">Re-verify your identity</h2>
              <p className="text-sm leading-relaxed text-ink-500">
                {status?.reKycDueAt && `Due for ${fmtDate(status.reKycDueAt)}. `}
                {requiresOtp && requiresFace
                  ? "We'll confirm an Aadhaar OTP and a quick liveness check."
                  : requiresOtp
                  ? "We'll send an OTP to your Aadhaar-linked mobile."
                  : "We'll do a quick liveness check."}
              </p>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button
                size="lg"
                className="mx-auto"
                onClick={() => setStep(requiresOtp ? "aadhaar" : "face")}
              >
                Begin verification <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          )}

          {step === "aadhaar" && (
            <Card key="aadhaar" tone="brand">
              <IconBubble tone="brand">
                <KeyRound className="h-8 w-8 text-brand-600" />
              </IconBubble>
              <h2 className="text-xl font-bold text-ink-900">Enter your Aadhaar number</h2>
              <p className="text-sm text-ink-500">
                We send a one-time password to the mobile linked with your Aadhaar.
                Your full Aadhaar is never stored.
              </p>
              <div className="text-left">
                <Label htmlFor="aadhaar">Aadhaar number</Label>
                <Input
                  id="aadhaar"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="1234 5678 9012"
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="text-center tracking-[0.2em]"
                />
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button
                size="lg"
                className="mx-auto"
                disabled={aadhaar.length !== 12 || busy}
                onClick={initiate}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </Card>
          )}

          {step === "otp" && (
            <Card key="otp" tone="brand">
              <IconBubble tone="brand">
                <Fingerprint className="h-8 w-8 text-brand-600" />
              </IconBubble>
              <h2 className="text-xl font-bold text-ink-900">Enter the OTP</h2>
              <p className="text-sm text-ink-500">
                Enter the one-time password sent to your Aadhaar-linked mobile.
              </p>
              <div className="text-left">
                <Label htmlFor="otp">One-time password</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="text-center text-lg font-mono tracking-[0.3em]"
                />
              </div>
              {needsStepUp && (
                <div className="text-left">
                  <Label htmlFor="stepup">Two-factor code</Label>
                  <Input
                    id="stepup"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="2FA code"
                    value={stepUpCode}
                    onChange={(e) => setStepUpCode(e.target.value.replace(/\D/g, ""))}
                    className="text-center font-mono tracking-[0.2em]"
                  />
                </div>
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button
                size="lg"
                className="mx-auto"
                disabled={otp.length < 4 || busy}
                onClick={afterOtp}
              >
                {requiresFace ? <>Continue <ArrowRight className="h-4 w-4" /></> : <>Verify <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </Card>
          )}

          {step === "face" && (
            <Card key="face" tone="brand">
              <h2 className="text-xl font-bold text-ink-900">Quick liveness check</h2>
              <p className="text-sm text-ink-500">
                Center your face in the frame and capture. We compare it against your
                onboarding record (or set it up if this is your first check).
              </p>
              <LivenessCapture onCaptured={(ref) => setFaceProbeRef(ref)} captured={!!faceProbeRef} />
              {needsStepUp && (
                <div className="text-left">
                  <Label htmlFor="stepup2">Two-factor code</Label>
                  <Input
                    id="stepup2"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="2FA code"
                    value={stepUpCode}
                    onChange={(e) => setStepUpCode(e.target.value.replace(/\D/g, ""))}
                    className="text-center font-mono tracking-[0.2em]"
                  />
                </div>
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button
                size="lg"
                className="mx-auto"
                disabled={!faceProbeRef || busy}
                onClick={() => submitVerify()}
              >
                Verify <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          )}

          {step === "submitting" && (
            <Centered key="submitting">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              <p className="text-sm text-ink-500">Verifying your identity…</p>
            </Centered>
          )}

          {step === "done" && (
            <Card key="done" tone="emerald">
              <IconBubble tone="emerald">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </IconBubble>
              <h2 className="text-xl font-bold text-ink-900">Verification complete</h2>
              <p className="text-sm text-ink-500">
                Your account is unlocked.
                {nextDue ? ` Next re-verification is due ${fmtDate(nextDue)}.` : ""}
              </p>
              <Button className="mx-auto" onClick={() => router.push("/dashboard")}>
                Back to dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Small presentational helpers (match existing design language) ────────────

function Card({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brand" | "amber" | "emerald";
}) {
  const ring =
    tone === "amber"
      ? "ring-amber-100"
      : tone === "emerald"
      ? "ring-emerald-100"
      : "ring-brand-100";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`space-y-4 rounded-3xl bg-white p-7 text-center shadow-soft ring-1 ${ring}`}
    >
      {children}
    </motion.div>
  );
}

function IconBubble({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brand" | "amber" | "emerald";
}) {
  const bg =
    tone === "amber"
      ? "from-amber-50 to-brand-50 ring-amber-100"
      : tone === "emerald"
      ? "from-emerald-50 to-brand-50 ring-emerald-100"
      : "from-brand-50 to-emerald-50 ring-brand-100";
  return (
    <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ring-1 ${bg}`}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3 rounded-3xl bg-white p-10 text-center shadow-soft ring-1 ring-ink-100"
    >
      {children}
    </motion.div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
      {children}
    </div>
  );
}

/**
 * Lightweight liveness capture: previews the webcam and snapshots a frame.
 * Produces an opaque probe reference for the eKYC Hub face-match step. Phase 14
 * will replace the local reference with a signed Cloudinary upload of the frame.
 */
function LivenessCapture({
  onCaptured,
  captured,
}: {
  onCaptured: (ref: string) => void;
  captured: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setErr("Camera access is required for the liveness check.");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.7));
    // Opaque probe reference for the provider face-match call.
    onCaptured(`live_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    stop();
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto grid aspect-video w-full max-w-xs place-items-center overflow-hidden rounded-2xl border border-ink-200 bg-ink-900/90">
        {snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot} alt="Liveness capture" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        )}
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      {!captured ? (
        active ? (
          <Button type="button" variant="outline" className="mx-auto" onClick={capture}>
            <Camera className="h-4 w-4" /> Capture
          </Button>
        ) : (
          <Button type="button" variant="outline" className="mx-auto" onClick={start}>
            <Camera className="h-4 w-4" /> Start camera
          </Button>
        )
      ) : (
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Captured
        </p>
      )}
    </div>
  );
}
