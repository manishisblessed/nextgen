"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileSignature,
  Camera,
  MapPin,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";

type Approval = {
  id: string;
  status: string;
  onboardeeRole: string;
  onboardeeName: string;
  onboardeePhone: string;
  onboardeeEmail: string;
  inviteStatus: string;
  sentAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
};

type ApprovalPhase = "list" | "reviewing";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<ApprovalPhase>("list");
  const [selected, setSelected] = useState<Approval | null>(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/declarations/pending");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals);
      }
    } catch {
      setError("Failed to load approvals");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const pending = approvals.filter((a) => a.status === "PENDING");
  const completed = approvals.filter((a) => a.status !== "PENDING");

  function startReview(approval: Approval) {
    setSelected(approval);
    setPhase("reviewing");
  }

  if (phase === "reviewing" && selected) {
    return (
      <ApprovalReviewPage
        approval={selected}
        onBack={() => { setPhase("list"); fetchApprovals(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network"
        title="Declaration Approvals"
        description="Review and approve onboarding declarations from your network members."
        actions={
          <Button variant="outline" onClick={fetchApprovals} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* Pending Approvals */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-ink-900">Pending Approvals ({pending.length})</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {pending.map((a) => (
                  <ApprovalCard key={a.id} approval={a} onReview={() => startReview(a)} />
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && (
            <div className="rounded-2xl border border-ink-100 bg-white p-12 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <p className="mt-3 text-lg font-semibold text-ink-900">All caught up!</p>
              <p className="mt-1 text-ink-500">No pending declaration approvals.</p>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-ink-900">History</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completed.map((a) => (
                  <ApprovalCard key={a.id} approval={a} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ApprovalCard({ approval, onReview }: { approval: Approval; onReview?: () => void }) {
  const statusConfig = {
    PENDING: { color: "bg-amber-100 text-amber-800", icon: Clock, label: "Pending" },
    APPROVED: { color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2, label: "Approved" },
    REJECTED: { color: "bg-rose-100 text-rose-800", icon: XCircle, label: "Rejected" },
    EXPIRED: { color: "bg-ink-100 text-ink-600", icon: Clock, label: "Expired" },
  }[approval.status] ?? { color: "bg-ink-100 text-ink-600", icon: Clock, label: approval.status };

  const StatusIcon = statusConfig.icon;

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-ink-900">{approval.onboardeeName}</p>
          <p className="text-xs text-ink-500">{approval.onboardeeRole.replace(/_/g, " ")}</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusConfig.color}`}>
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-ink-400 text-xs">Phone</p>
          <p className="text-ink-700">{approval.onboardeePhone}</p>
        </div>
        <div>
          <p className="text-ink-400 text-xs">Email</p>
          <p className="text-ink-700 truncate">{approval.onboardeeEmail}</p>
        </div>
        <div>
          <p className="text-ink-400 text-xs">Sent</p>
          <p className="text-ink-700">{new Date(approval.sentAt).toLocaleDateString()}</p>
        </div>
        {approval.approvedAt && (
          <div>
            <p className="text-ink-400 text-xs">Approved</p>
            <p className="text-ink-700">{new Date(approval.approvedAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>
      {approval.rejectedReason && (
        <p className="mt-2 text-xs text-rose-600">Reason: {approval.rejectedReason}</p>
      )}
      {onReview && approval.status === "PENDING" && (
        <Button className="mt-4 w-full" onClick={onReview}>
          <FileSignature className="h-4 w-4" /> Review & Approve
        </Button>
      )}
    </div>
  );
}

function ApprovalReviewPage({ approval, onBack }: { approval: Approval; onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  // Signature
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  // Selfie
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // GPS
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Canvas drawing
  function initCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }

  useEffect(() => { initCanvas(); }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSigned(true);
  }

  function endDraw() {
    setIsDrawing(false);
  }

  function clearSignature() {
    setHasSigned(false);
    initCanvas();
  }

  // Camera
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOpen(true);
    } catch {
      setError("Camera access is required for the approval selfie.");
    }
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setSelfieDataUrl(dataUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraOpen(false);
  }

  function retakeSelfie() {
    setSelfieDataUrl(null);
    openCamera();
  }

  // GPS
  async function getLocation() {
    setGpsLoading(true);
    setGpsError("");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setGpsError("Could not get your location. Please enable location services.");
    }
    setGpsLoading(false);
  }

  // Upload signature as data URL to Cloudinary via the server
  async function uploadDataUrl(dataUrl: string, type: string): Promise<string> {
    const res = await fetch("/api/declarations/upload-evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, type }),
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
  }

  async function handleApprove() {
    if (!hasSigned || !selfieDataUrl || !gps) {
      setError("Please complete signature, selfie, and location before approving.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const signatureDataUrl = canvasRef.current!.toDataURL("image/png");
      const [signatureUrl, selfieUrl] = await Promise.all([
        uploadDataUrl(signatureDataUrl, "approval_signature"),
        uploadDataUrl(selfieDataUrl, "approval_selfie"),
      ]);

      const res = await fetch(`/api/declarations/${approval.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureUrl,
          selfieUrl,
          latitude: gps.lat,
          longitude: gps.lng,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
      } else {
        setError(data.error ?? "Approval failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  async function handleReject() {
    if (!rejectReason || rejectReason.length < 5) {
      setError("Please provide a reason for rejection (min 5 characters).");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/declarations/${approval.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (data.ok) {
        setRejected(true);
      } else {
        setError(data.error ?? "Rejection failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-ink-900">Declaration Approved</h2>
        <p className="text-ink-600">
          You have approved <strong>{approval.onboardeeName}</strong>&apos;s onboarding as a{" "}
          <strong>{approval.onboardeeRole.replace(/_/g, " ")}</strong>.
          They can now complete their registration.
        </p>
        <Button onClick={onBack}>Back to Approvals</Button>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white">
          <XCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-ink-900">Declaration Rejected</h2>
        <p className="text-ink-600">
          You have rejected <strong>{approval.onboardeeName}</strong>&apos;s onboarding declaration.
        </p>
        <Button onClick={onBack}>Back to Approvals</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Review: ${approval.onboardeeName}`}
        description={`${approval.onboardeeRole.replace(/_/g, " ")} onboarding declaration approval`}
        actions={
          <Button variant="outline" onClick={onBack}>Back</Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
        </div>
      )}

      {/* Applicant Info */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
        <h3 className="mb-3 font-bold text-ink-900">Applicant Details</h3>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-ink-400 text-xs">Name</p>
            <p className="font-medium text-ink-900">{approval.onboardeeName}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs">Role</p>
            <p className="font-medium text-ink-900">{approval.onboardeeRole.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs">Phone</p>
            <p className="font-medium text-ink-900">{approval.onboardeePhone}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs">Email</p>
            <p className="font-medium text-ink-900">{approval.onboardeeEmail}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs">Requested</p>
            <p className="font-medium text-ink-900">{new Date(approval.sentAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Declaration Warning */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-2">Important: Responsibility Declaration</p>
            <p>
              By approving this declaration, you accept full responsibility for all activities,
              transactions, and obligations of this {approval.onboardeeRole.replace(/_/g, " ")}.
              This includes liability for chargebacks, fraud, disputes, and any financial
              losses as outlined in the declaration form.
            </p>
          </div>
        </div>
      </div>

      {/* Signature */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-3">
          <FileSignature className="h-5 w-5 text-brand-600" />
          <h3 className="font-bold text-ink-900">Your Signature</h3>
          {hasSigned && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>
        <div className="relative rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={500}
            height={200}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
        {hasSigned && (
          <button type="button" onClick={clearSignature} className="mt-2 text-xs text-brand-600 hover:underline">
            Clear & redraw
          </button>
        )}
        {!hasSigned && (
          <p className="mt-2 text-xs text-ink-400">Draw your signature above using mouse or touch.</p>
        )}
      </div>

      {/* Selfie */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-3">
          <Camera className="h-5 w-5 text-brand-600" />
          <h3 className="font-bold text-ink-900">Approval Selfie</h3>
          {selfieDataUrl && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>

        {!selfieDataUrl && !cameraOpen && (
          <Button variant="outline" onClick={openCamera}>
            <Camera className="h-4 w-4" /> Open Camera
          </Button>
        )}

        {cameraOpen && (
          <div className="space-y-3">
            <div className="relative mx-auto max-w-sm overflow-hidden rounded-2xl border border-ink-200">
              <video ref={videoRef} className="w-full" muted playsInline autoPlay />
            </div>
            <Button className="w-full max-w-sm mx-auto" onClick={capturePhoto}>
              <Camera className="h-4 w-4" /> Capture Photo
            </Button>
          </div>
        )}

        {selfieDataUrl && (
          <div className="space-y-3">
            <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-emerald-200">
              <img src={selfieDataUrl} alt="Approval selfie" className="w-full" />
            </div>
            <button type="button" onClick={retakeSelfie} className="text-xs text-brand-600 hover:underline">
              Retake selfie
            </button>
          </div>
        )}
      </div>

      {/* GPS Location */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-5 w-5 text-brand-600" />
          <h3 className="font-bold text-ink-900">Location Verification</h3>
          {gps && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>

        {!gps && (
          <div className="space-y-2">
            <Button variant="outline" onClick={getLocation} disabled={gpsLoading}>
              {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {gpsLoading ? "Getting location..." : "Capture My Location"}
            </Button>
            {gpsError && <p className="text-xs text-rose-600">{gpsError}</p>}
          </div>
        )}

        {gps && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <p className="text-emerald-800">
              Location captured: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              {new Date().toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleApprove}
          disabled={submitting || !hasSigned || !selfieDataUrl || !gps}
          className="flex-1"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve Declaration
        </Button>
        {!showReject ? (
          <Button variant="outline" onClick={() => setShowReject(true)} className="text-rose-600 border-rose-200 hover:bg-rose-50">
            <XCircle className="h-4 w-4" /> Reject
          </Button>
        ) : (
          <div className="flex-1 space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (min 5 characters)..."
              className="w-full rounded-lg border border-rose-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={submitting || rejectReason.length < 5}
                className="text-rose-600 border-rose-200"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirm Reject
              </Button>
              <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
