"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Building2,
  CreditCard,
  User,
  Lock,
  Phone,
  Mail,
  Fingerprint,
  Upload,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { namesMatch } from "@/lib/utils";
import { extractGpsFromFile } from "@/lib/gps";
import { LivenessVideoCapture } from "@/components/kyc/LivenessVideoCapture";

type InviteData = {
  id: string;
  phone: string;
  email: string;
  role: string;
  name: string | null;
  status: string;
  expiresAt: string;
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
  aadhaarVerifiedAt: string | null;
};

type Verification = {
  type: string;
  status: string;
  verifiedName: string | null;
};

const STEPS = [
  { label: "Welcome", icon: ShieldCheck },
  { label: "Mobile Verification", icon: Phone },
  { label: "Email Verification", icon: Mail },
  { label: "Aadhaar Verification", icon: Fingerprint },
  { label: "PAN Verification", icon: CreditCard },
  { label: "Bank Verification", icon: Building2 },
  { label: "GST & MSME", icon: Building2 },
  { label: "Selfie & Video", icon: Upload },
  { label: "Documents", icon: FileText },
  { label: "Details & Password", icon: Lock },
] as const;

type DocumentDef = {
  type: string;
  label: string;
  required: boolean;
  accept: string;
  requiresGps?: boolean;
  description?: string;
};

const REQUIRED_DOCUMENTS: DocumentDef[] = [
  { type: "GST_CERT", label: "GST Certificate", required: true, accept: "image/*,.pdf" },
  { type: "SHOP_ESTABLISHMENT", label: "Shop & Establishment Certificate", required: true, accept: "image/*,.pdf" },
  { type: "GUMASTA_LICENSE", label: "Gumasta License", required: true, accept: "image/*,.pdf" },
  { type: "SIGNATURE", label: "Signature", required: true, accept: "image/*" },
  { type: "ELECTRICITY_BILL", label: "Household Electricity Bill (copy)", required: true, accept: "image/*,.pdf" },
  { type: "CANCEL_CHEQUE", label: "Cancelled Cheque / Bank Passbook (with account holder name)", required: true, accept: "image/*,.pdf", description: "Already verified via penny drop, but physical copy needed" },
  { type: "ADDITIONAL_ID", label: "Additional ID Proof (Driving License / Voter ID / Passport)", required: true, accept: "image/*,.pdf" },
  { type: "FAMILY_REFERENCE", label: "Family Member Reference Document", required: true, accept: "image/*,.pdf" },
  { type: "PG_FORM", label: "PG Form", required: true, accept: "image/*,.pdf" },
  { type: "GPS_PHOTO_OUTSIDE", label: "GPS-tagged Photo — House/Office (Outside)", required: true, accept: "image/*", requiresGps: true },
  { type: "GPS_PHOTO_INSIDE", label: "GPS-tagged Photo — House/Office (Inside)", required: true, accept: "image/*", requiresGps: true },
  { type: "GPS_SELFIE_DISTRIBUTOR", label: "GPS-tagged Selfie with Salesperson/Distributor", required: true, accept: "image/*", requiresGps: true, description: "Mandatory — take a selfie with your distributor/salesperson at your location" },
  { type: "DISTRIBUTOR_DECLARATION", label: "Distributor Declaration Form", required: true, accept: "image/*,.pdf" },
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal",
];

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      }
    >
      <OnboardContent />
    </Suspense>
  );
}

function OnboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    shopName: "",
    shopAddress: "",
    city: "",
    state: "Delhi",
    pincode: "",
    dob: "",
    panNumber: "",
    aadhaarLast4: "",
    aadhaarNumber: "",
    aadhaarName: "",
    aadhaarDob: "",
    aadhaarGender: "",
    aadhaarAddress: "",
    aadhaarMobile: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    bankAccountStatus: "",
    gstin: "",
    msmeNumber: "",
    password: "",
    confirmPassword: "",
  });

  // Verification results
  const [panResult, setPanResult] = useState<any>(null);
  const [bankResult, setBankResult] = useState<any>(null);
  const [gstResult, setGstResult] = useState<any>(null);
  const [aadhaarResult, setAadhaarResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [nameMismatch, setNameMismatch] = useState(false);

  // OTP state
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [aadhaarVerified, setAadhaarVerified] = useState(false);

  // Digilocker state
  const [digilockerPending, setDigilockerPending] = useState(false);
  const [digilockerIds, setDigilockerIds] = useState<{
    verification_id: string;
    reference_id: string;
  } | null>(null);

  // Document upload state
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  // Selfie & video state
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [videoCompleted, setVideoCompleted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid onboarding link. No token found.");
      setLoading(false);
      return;
    }
    fetchInvite();
  }, [token]);

  const autoVerifyRef = useRef(false);

  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const t = setTimeout(() => setOtpResendTimer((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendTimer]);

  // Listen for Digilocker popup return
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "DIGILOCKER_COMPLETE" && digilockerIds) {
        completeAadhaar();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [digilockerIds]);

  async function fetchInvite() {
    setLoading(true);
    const res = await fetch(`/api/onboard/${token}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Invalid invite link");
      setLoading(false);
      return;
    }
    setInvite(data.invite);
    setVerifications(data.verifications ?? []);

    if (data.invite.name) {
      setForm((f) => ({ ...f, name: data.invite.name }));
    }

    // Restore verification state from invite
    if (data.invite.phoneVerifiedAt) setPhoneVerified(true);
    if (data.invite.emailVerifiedAt) setEmailVerified(true);
    if (data.invite.aadhaarVerifiedAt) setAadhaarVerified(true);

    // Restore verification results from previous session
    const vList = data.verifications ?? [];
    const aadhaarV = vList.find(
      (v: Verification) => v.type === "AADHAAR_DIGILOCKER" && v.status === "Success"
    );
    if (aadhaarV) {
      setAadhaarResult({ name: aadhaarV.verifiedName });
      if (aadhaarV.verifiedName) {
        setForm((f) => ({ ...f, aadhaarName: aadhaarV.verifiedName ?? "" }));
      }
    }

    const panV = vList.find(
      (v: Verification) => v.type === "PAN_360" && v.status === "Success"
    );
    if (panV) {
      setPanResult({ registered_name: panV.verifiedName });
    }

    const bankV = vList.find(
      (v: Verification) =>
        (v.type === "BANK_PENNY_DROP" || v.type === "BANK_ADVANCE") &&
        v.status === "Success"
    );
    if (bankV) {
      setBankResult({ nameAtBank: bankV.verifiedName });
    }

    setLoading(false);
  }

  function updateForm(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ----- OTP -----
  function handleOtpChange(value: string, channel: "SMS" | "EMAIL") {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setOtpCode(cleaned);
    if (cleaned.length === 6 && otpSent && !verifying && !autoVerifyRef.current) {
      autoVerifyRef.current = true;
      verifyOtp(channel, cleaned).finally(() => { autoVerifyRef.current = false; });
    }
  }

  async function sendOtp(channel: "SMS" | "EMAIL") {
    setVerifying(true);
    setError("");
    setOtpCode("");
    try {
      const res = await fetch(`/api/onboard/${token}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (data.alreadyVerified) {
        if (channel === "SMS") setPhoneVerified(true);
        else setEmailVerified(true);
      } else if (data.ok) {
        setOtpSent(true);
        setOtpResendTimer(60);
      } else {
        setError(data.error ?? "Failed to send OTP");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  async function verifyOtp(channel: "SMS" | "EMAIL", codeOverride?: string) {
    const code = codeOverride ?? otpCode;
    if (code.length !== 6) {
      setError("Please enter the 6-digit OTP");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/onboard/${token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, code }),
      });
      const data = await res.json();
      if (data.ok) {
        if (channel === "SMS") setPhoneVerified(true);
        else setEmailVerified(true);
        setOtpSent(false);
        setOtpCode("");
      } else {
        setError(data.error ?? "Invalid OTP");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  // ----- Aadhaar DigiLocker -----
  async function initAadhaar() {
    setVerifying(true);
    setError("");
    const redirectUrl = `${window.location.origin}/onboard?token=${token}&digilocker=complete`;
    try {
      const res = await fetch(`/api/onboard/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "AADHAAR_INIT",
          redirect_url: redirectUrl,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDigilockerIds({
          verification_id: data.data.verification_id,
          reference_id: String(data.data.reference_id),
        });
        setDigilockerPending(true);
        window.open(data.data.url, "_blank", "width=800,height=600");
      } else {
        setError(data.message ?? "Failed to initiate Aadhaar verification");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  // Check if digilocker=complete is in URL (redirect back from DigiLocker)
  useEffect(() => {
    if (searchParams.get("digilocker") === "complete" && !aadhaarVerified) {
      if (window.opener) {
        window.opener.postMessage({ type: "DIGILOCKER_COMPLETE" }, "*");
        window.close();
      }
    }
  }, [searchParams, aadhaarVerified]);

  async function completeAadhaar() {
    if (!digilockerIds) return;
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/onboard/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "AADHAAR_COMPLETE",
          verification_id: digilockerIds.verification_id,
          reference_id: digilockerIds.reference_id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setAadhaarResult(data.data);
        setAadhaarVerified(true);
        setDigilockerPending(false);
        setForm((f) => ({
          ...f,
          name: f.name || data.data.name || "",
          aadhaarName: data.data.name || "",
          aadhaarNumber: data.data.uid || "",
          aadhaarLast4: data.data.uid ? data.data.uid.slice(-4) : "",
          aadhaarDob: data.data.dob || "",
          aadhaarGender: data.data.gender || "",
          aadhaarAddress: data.data.address || "",
          aadhaarMobile: data.data.aadhaarMobile || "",
          dob: data.data.dob || f.dob,
          state: data.data.state || f.state,
          pincode: data.data.pincode || f.pincode,
          city: data.data.city || f.city,
        }));
      } else {
        setError(data.message ?? "Aadhaar verification failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  // ----- PAN -----
  async function verifyPan() {
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.panNumber.toUpperCase())) {
      setError("Invalid PAN format. Expected: ABCDE1234F");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/onboard/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "PAN_360", pan: form.panNumber.toUpperCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        setPanResult(data.data);
        setForm((f) => ({
          ...f,
          panNumber: f.panNumber.toUpperCase(),
          name: f.name || data.data.registered_name,
          dob: data.data.date_of_birth || f.dob,
        }));
        // Cross-check PAN name with Aadhaar name
        if (aadhaarResult?.name && data.data.registered_name) {
          if (!namesMatch(aadhaarResult.name, data.data.registered_name)) {
            setNameMismatch(true);
          }
        }
      } else {
        setError(data.message ?? "PAN verification failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  // ----- Bank -----
  async function verifyBank() {
    if (!form.bankAccountNumber || !form.bankIfsc) {
      setError("Please enter account number and IFSC");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/onboard/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "BANK_PENNY_DROP",
          account_number: form.bankAccountNumber,
          ifsc: form.bankIfsc.toUpperCase(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBankResult(data.data);
        setForm((f) => ({
          ...f,
          bankIfsc: f.bankIfsc.toUpperCase(),
          bankName: data.data.nameAtBank || "",
          bankAccountStatus: data.data.accountStatus || "active",
        }));
        // Cross-check bank name with Aadhaar/PAN name
        const refName = aadhaarResult?.name || panResult?.registered_name;
        if (refName && data.data.nameAtBank) {
          if (!namesMatch(refName, data.data.nameAtBank)) {
            setNameMismatch(true);
          }
        }
      } else {
        setError(data.message ?? "Bank verification failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  // ----- GST -----
  async function verifyGst() {
    if (!form.gstin || form.gstin.length !== 15) {
      setError("Please enter a valid 15-character GSTIN");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/onboard/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "GST", gst: form.gstin.toUpperCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        setGstResult(data.data);
      } else {
        setError(data.message ?? "GST verification failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  // ----- Document Upload -----
  async function uploadDocument(type: string, file: File, opts?: { requiresGps?: boolean }) {
    setUploading(type);
    setError("");
    try {
      let gpsLatitude: number | undefined;
      let gpsLongitude: number | undefined;

      if (opts?.requiresGps) {
        const gps = await extractGpsFromFile(file);
        if (!gps) {
          setError(
            "This photo must have GPS location data. Please take a new photo with location enabled on your camera/phone."
          );
          setUploading(null);
          return;
        }
        gpsLatitude = gps.latitude;
        gpsLongitude = gps.longitude;
      }

      const signRes = await fetch(`/api/onboard/${token}/documents/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!signRes.ok) throw new Error("Failed to get upload signature");
      const params = await signRes.json();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", params.apiKey);
      formData.append("timestamp", String(params.timestamp));
      formData.append("signature", params.signature);
      formData.append("folder", params.folder);
      formData.append("type", params.type);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${params.cloudName}/auto/upload`,
        { method: "POST", body: formData }
      );
      if (!uploadRes.ok) throw new Error("Upload failed");
      const cloudResult = await uploadRes.json();

      const docRes = await fetch(`/api/onboard/${token}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          publicId: cloudResult.public_id,
          url: cloudResult.secure_url,
          resourceType: cloudResult.resource_type,
          format: cloudResult.format,
          bytes: cloudResult.bytes,
          width: cloudResult.width,
          height: cloudResult.height,
          gpsLatitude,
          gpsLongitude,
        }),
      });
      if (!docRes.ok) throw new Error("Failed to save document");

      setUploadedDocs((prev) => ({ ...prev, [type]: true }));
      if (type === "SELFIE") setSelfieUploaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(null);
  }

  // ----- Submit -----
  async function handleSubmit() {
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!form.name || !form.shopName || !form.pincode) {
      setError("Please fill in all required fields");
      return;
    }

    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/onboard/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          password: form.password,
          shopName: form.shopName,
          shopAddress: form.shopAddress,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          panNumber: form.panNumber.toUpperCase() || undefined,
          panName: panResult?.registered_name || undefined,
          aadhaarLast4: form.aadhaarLast4 || undefined,
          aadhaarNumber: form.aadhaarNumber || undefined,
          aadhaarName: form.aadhaarName || undefined,
          aadhaarDob: form.aadhaarDob || undefined,
          aadhaarGender: form.aadhaarGender || undefined,
          aadhaarAddress: form.aadhaarAddress || undefined,
          aadhaarMobile: form.aadhaarMobile || undefined,
          bankAccountNumber: form.bankAccountNumber || undefined,
          bankIfsc: form.bankIfsc.toUpperCase() || undefined,
          bankName: bankResult?.nameAtBank || form.bankName || undefined,
          bankAccountStatus: form.bankAccountStatus || undefined,
          gstin: form.gstin.toUpperCase() || undefined,
          msmeNumber: form.msmeNumber || undefined,
          nameMismatch,
          dob: form.dob || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
      } else {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Registration failed. Please try again."
        );
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setVerifying(false);
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return true;
      case 1:
        return phoneVerified;
      case 2:
        return emailVerified;
      case 3:
        return aadhaarVerified;
      case 4:
        return !!panResult;
      case 5:
        return !!bankResult;
      case 6:
        return true; // GST/MSME optional verification
      case 7:
        return selfieUploaded && videoCompleted;
      case 8: {
        const allRequiredDocs = REQUIRED_DOCUMENTS.filter((d) => d.required);
        return allRequiredDocs.every((d) => !!uploadedDocs[d.type]);
      }
      case 9:
        return !!form.password && !!form.name && !!form.shopName && !!form.pincode;
      default:
        return true;
    }
  }

  function handleNext() {
    setError("");
    setOtpSent(false);
    setOtpCode("");
    setStep(step + 1);
  }

  function handleBack() {
    setError("");
    setOtpSent(false);
    setOtpCode("");
    setStep(Math.max(0, step - 1));
  }

  // ----- Renders -----
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-rose-50 p-4">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h2 className="mt-4 text-xl font-bold text-ink-900">Invalid Link</h2>
          <p className="mt-2 text-ink-600">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 p-4">
        <div className="max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-ink-900">
            Registration Complete!
          </h2>
          <p className="mt-2 text-ink-600">
            {nameMismatch
              ? "Your details have been submitted. Since some document names didn't match, your application will be reviewed by our team. You'll receive a notification once approved."
              : "Your details have been submitted for admin approval. You'll receive a notification once approved."}
          </p>
          <p className="mt-3 text-sm text-ink-500">
            A confirmation email has been sent to <strong>{invite?.email}</strong> with
            your login details.
          </p>
          <Button className="mt-6" onClick={() => router.push("/login")}>
            Go to Login <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-brand-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold text-ink-900">
            NextGenPay Registration
          </h1>
          <p className="mt-1 text-ink-600">
            Complete your onboarding as{" "}
            <strong>{invite?.role.replace(/_/g, " ")}</strong>
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex items-center justify-center gap-1 min-w-max px-2">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-1">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
                    i < step
                      ? "bg-emerald-500 text-white"
                      : i === step
                      ? "bg-brand-600 text-white"
                      : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </span>
                <span
                  className={`hidden text-xs sm:inline ${
                    i === step ? "font-semibold text-ink-900" : "text-ink-500"
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="mx-0.5 h-px w-3 bg-ink-200" />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-4 text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-brand-600" />
              <h2 className="text-lg font-bold text-ink-900">Welcome!</h2>
              <p className="text-ink-600">
                You&apos;ve been invited to register as a{" "}
                <strong>{invite?.role.replace(/_/g, " ")}</strong> on NextGenPay.
              </p>
              <div className="rounded-xl bg-ink-50 p-4 text-left text-sm">
                <p>
                  <strong>Email:</strong> {invite?.email}
                </p>
                <p>
                  <strong>Phone:</strong> {invite?.phone}
                </p>
                <p>
                  <strong>Expires:</strong>{" "}
                  {invite?.expiresAt
                    ? new Date(invite.expiresAt).toLocaleDateString()
                    : "\u2014"}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                <p className="mb-2 font-semibold">
                  Please keep the following ready to complete registration:
                </p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Access to your registered mobile &amp; email for OTP</li>
                  <li>Aadhaar card (for DigiLocker verification)</li>
                  <li>PAN card number</li>
                  <li>Bank account details (Account Number + IFSC)</li>
                  <li>GSTIN / MSME number (optional for verification)</li>
                  <li>Live selfie photo &amp; 10-second video</li>
                  <li>GST Certificate, Shop &amp; Establishment, Gumasta License</li>
                  <li>Signature, Electricity Bill, Cancelled Cheque copy</li>
                  <li>Additional ID proof (DL / Voter ID / Passport)</li>
                  <li>Family member reference document</li>
                  <li>PG Form &amp; Distributor Declaration Form</li>
                  <li>GPS-tagged photos of house/office (inside &amp; outside)</li>
                  <li>GPS-tagged selfie with your salesperson/distributor</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 1: Mobile OTP */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Phone className="h-5 w-5" />
                <h2 className="font-bold">Mobile Number Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                We&apos;ll send an OTP to your registered mobile number to verify
                ownership.
              </p>
              {phoneVerified ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <p className="mt-2 font-semibold text-emerald-800">
                    Mobile Number Verified
                  </p>
                  <p className="text-sm text-emerald-700">{invite?.phone}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-ink-50 p-4">
                    <p className="text-sm text-ink-600">Mobile Number</p>
                    <p className="text-lg font-bold text-ink-900">
                      {invite?.phone}
                    </p>
                  </div>
                  {!otpSent ? (
                    <Button
                      onClick={() => sendOtp("SMS")}
                      disabled={verifying}
                      className="w-full"
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Phone className="h-4 w-4" />
                      )}
                      Send OTP
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label>Enter 6-digit OTP</Label>
                        <Input
                          value={otpCode}
                          onChange={(e) => handleOtpChange(e.target.value, "SMS")}
                          placeholder="000000"
                          maxLength={6}
                          autoFocus
                          className="text-center text-lg tracking-widest"
                        />
                      </div>
                      {verifying && (
                        <div className="flex items-center justify-center gap-2 text-sm text-brand-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verifying...
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => sendOtp("SMS")}
                        disabled={otpResendTimer > 0 || verifying}
                        className="w-full text-center text-sm text-brand-600 hover:underline disabled:text-ink-400"
                      >
                        {otpResendTimer > 0
                          ? `Resend OTP in ${otpResendTimer}s`
                          : "Resend OTP"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Email OTP */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Mail className="h-5 w-5" />
                <h2 className="font-bold">Email Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                We&apos;ll send an OTP to your registered email to verify ownership.
              </p>
              {emailVerified ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <p className="mt-2 font-semibold text-emerald-800">
                    Email Verified
                  </p>
                  <p className="text-sm text-emerald-700">{invite?.email}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-ink-50 p-4">
                    <p className="text-sm text-ink-600">Email Address</p>
                    <p className="text-lg font-bold text-ink-900">
                      {invite?.email}
                    </p>
                  </div>
                  {!otpSent ? (
                    <Button
                      onClick={() => sendOtp("EMAIL")}
                      disabled={verifying}
                      className="w-full"
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      Send OTP
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label>Enter 6-digit OTP</Label>
                        <Input
                          value={otpCode}
                          onChange={(e) => handleOtpChange(e.target.value, "EMAIL")}
                          placeholder="000000"
                          maxLength={6}
                          autoFocus
                          className="text-center text-lg tracking-widest"
                        />
                      </div>
                      {verifying && (
                        <div className="flex items-center justify-center gap-2 text-sm text-brand-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verifying...
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => sendOtp("EMAIL")}
                        disabled={otpResendTimer > 0 || verifying}
                        className="w-full text-center text-sm text-brand-600 hover:underline disabled:text-ink-400"
                      >
                        {otpResendTimer > 0
                          ? `Resend OTP in ${otpResendTimer}s`
                          : "Resend OTP"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Aadhaar DigiLocker */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Fingerprint className="h-5 w-5" />
                <h2 className="font-bold">Aadhaar Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                Verify your Aadhaar through DigiLocker. You&apos;ll be redirected to
                the DigiLocker portal to authorize access to your Aadhaar details.
              </p>
              {aadhaarVerified && aadhaarResult ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <p className="font-semibold text-emerald-800">
                      Aadhaar Verified via DigiLocker
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-emerald-700">Name:</span>{" "}
                      {aadhaarResult.name}
                    </div>
                    {aadhaarResult.uid && (
                      <div>
                        <span className="text-emerald-700">Aadhaar:</span>{" "}
                        XXXX-XXXX-{aadhaarResult.uid.slice(-4)}
                      </div>
                    )}
                    {aadhaarResult.dob && (
                      <div>
                        <span className="text-emerald-700">DOB:</span>{" "}
                        {aadhaarResult.dob}
                      </div>
                    )}
                    {aadhaarResult.gender && (
                      <div>
                        <span className="text-emerald-700">Gender:</span>{" "}
                        {aadhaarResult.gender}
                      </div>
                    )}
                    {aadhaarResult.address && (
                      <div className="col-span-2">
                        <span className="text-emerald-700">Address:</span>{" "}
                        {aadhaarResult.address}
                      </div>
                    )}
                    {form.aadhaarMobile && (
                      <div>
                        <span className="text-emerald-700">
                          Aadhaar Mobile:
                        </span>{" "}
                        {form.aadhaarMobile}
                      </div>
                    )}
                  </div>
                </div>
              ) : digilockerPending ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-600" />
                    <p className="mt-2 text-sm font-medium text-amber-800">
                      Waiting for DigiLocker verification...
                    </p>
                    <p className="text-xs text-amber-700">
                      Complete the process in the opened window, then click below.
                    </p>
                  </div>
                  <Button
                    onClick={completeAadhaar}
                    disabled={verifying}
                    className="w-full"
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    I&apos;ve Completed DigiLocker Verification
                  </Button>
                  <button
                    type="button"
                    onClick={initAadhaar}
                    disabled={verifying}
                    className="w-full text-center text-sm text-brand-600 hover:underline"
                  >
                    Re-open DigiLocker
                  </button>
                </div>
              ) : (
                <Button
                  onClick={initAadhaar}
                  disabled={verifying}
                  className="w-full"
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Fingerprint className="h-4 w-4" />
                  )}
                  Verify with DigiLocker
                </Button>
              )}
            </div>
          )}

          {/* Step 4: PAN Verification */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <CreditCard className="h-5 w-5" />
                <h2 className="font-bold">PAN Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                Enter your PAN number. We&apos;ll verify it and cross-check with
                your Aadhaar details.
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label>PAN Number *</Label>
                  <Input
                    value={form.panNumber}
                    onChange={(e) =>
                      updateForm("panNumber", e.target.value.toUpperCase())
                    }
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="uppercase"
                    disabled={!!panResult}
                  />
                </div>
                {!panResult && (
                  <Button
                    type="button"
                    onClick={verifyPan}
                    disabled={verifying || form.panNumber.length !== 10}
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Verify
                  </Button>
                )}
              </div>
              {panResult && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-800">
                      PAN Verified
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                      <p>
                        <span className="text-emerald-700">Name:</span>{" "}
                        {panResult.registered_name}
                      </p>
                      <p>
                        <span className="text-emerald-700">Type:</span>{" "}
                        {panResult.type}
                      </p>
                      {panResult.date_of_birth && (
                        <p>
                          <span className="text-emerald-700">DOB:</span>{" "}
                          {panResult.date_of_birth}
                        </p>
                      )}
                      <p>
                        <span className="text-emerald-700">Aadhaar Linked:</span>{" "}
                        {panResult.aadhaar_linked ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>
                  {/* Name match indicator */}
                  {aadhaarResult?.name && (
                    <NameMatchBadge
                      label="Aadhaar"
                      name1={aadhaarResult.name}
                      name2={panResult.registered_name}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Bank Verification */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Building2 className="h-5 w-5" />
                <h2 className="font-bold">Bank Account Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                We&apos;ll verify your bank account via Penny Drop (\u20B91
                deposit) and confirm the account holder name.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Account Number *</Label>
                  <Input
                    value={form.bankAccountNumber}
                    onChange={(e) =>
                      updateForm("bankAccountNumber", e.target.value)
                    }
                    placeholder="Enter account number"
                    disabled={!!bankResult}
                  />
                </div>
                <div>
                  <Label>IFSC Code *</Label>
                  <Input
                    value={form.bankIfsc}
                    onChange={(e) =>
                      updateForm("bankIfsc", e.target.value.toUpperCase())
                    }
                    placeholder="SBIN0001234"
                    maxLength={11}
                    className="uppercase"
                    disabled={!!bankResult}
                  />
                </div>
              </div>
              {!bankResult && (
                <Button
                  type="button"
                  onClick={verifyBank}
                  disabled={
                    verifying || !form.bankAccountNumber || !form.bankIfsc
                  }
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Verify Bank Account
                </Button>
              )}
              {bankResult && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-800">
                      Bank Account Verified
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <p>
                        <span className="text-emerald-700">Name at Bank:</span>{" "}
                        {bankResult.nameAtBank}
                      </p>
                      <p>
                        <span className="text-emerald-700">Account Status:</span>{" "}
                        <span
                          className={
                            bankResult.accountStatus === "active"
                              ? "font-semibold text-emerald-700"
                              : "font-semibold text-rose-600"
                          }
                        >
                          {bankResult.accountStatus?.toUpperCase() ?? "ACTIVE"}
                        </span>
                      </p>
                      {bankResult.utr && (
                        <p>
                          <span className="text-emerald-700">UTR:</span>{" "}
                          {bankResult.utr}
                        </p>
                      )}
                      <p>
                        <span className="text-emerald-700">Penny Drop:</span>{" "}
                        \u20B9{bankResult.depositAmount ?? 1} deposited
                      </p>
                    </div>
                  </div>
                  {/* Name match with Aadhaar/PAN */}
                  {(aadhaarResult?.name || panResult?.registered_name) && (
                    <NameMatchBadge
                      label="Aadhaar/PAN"
                      name1={aadhaarResult?.name ?? panResult?.registered_name}
                      name2={bankResult.nameAtBank}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 6: GST + MSME (Optional) */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Building2 className="h-5 w-5" />
                <h2 className="font-bold">GST &amp; MSME (Optional)</h2>
              </div>
              <p className="text-sm text-ink-600">
                If you have a GSTIN or Udyam (MSME) number, enter them here.
                You can skip this step.
              </p>

              {/* GST */}
              <div className="space-y-2">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label>GSTIN</Label>
                    <Input
                      value={form.gstin}
                      onChange={(e) =>
                        updateForm("gstin", e.target.value.toUpperCase())
                      }
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      className="uppercase"
                      disabled={!!gstResult}
                    />
                  </div>
                  {!gstResult && (
                    <Button
                      type="button"
                      onClick={verifyGst}
                      disabled={verifying || form.gstin.length !== 15}
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      Verify
                    </Button>
                  )}
                </div>
                {gstResult && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-800">
                      GST Verified
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                      <p>
                        <span className="text-emerald-700">Legal Name:</span>{" "}
                        {gstResult.legal_name}
                      </p>
                      <p>
                        <span className="text-emerald-700">Trade Name:</span>{" "}
                        {gstResult.trade_name}
                      </p>
                      <p>
                        <span className="text-emerald-700">Status:</span>{" "}
                        {gstResult.gst_status}
                      </p>
                      <p>
                        <span className="text-emerald-700">Type:</span>{" "}
                        {gstResult.taxpayer_type}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* MSME */}
              <div>
                <Label>Udyam / MSME Number (Optional)</Label>
                <Input
                  value={form.msmeNumber}
                  onChange={(e) =>
                    updateForm("msmeNumber", e.target.value.toUpperCase())
                  }
                  placeholder="UDYAM-XX-00-0000000"
                  className="uppercase"
                />
                <p className="mt-1 text-xs text-ink-500">
                  Enter your Udyam registration number if applicable. This will be
                  stored for records.
                </p>
              </div>
            </div>
          )}

          {/* Step 7: Selfie & 10-Second Video */}
          {step === 7 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Upload className="h-5 w-5" />
                <h2 className="font-bold">Retailer Live Photo &amp; Video</h2>
              </div>
              <p className="text-sm text-ink-600">
                Take a live selfie photo and record a 10-second video for identity verification.
                Both are mandatory.
              </p>

              {/* Selfie Upload */}
              <DocumentUploadField
                label="Live Selfie Photo"
                type="SELFIE"
                uploaded={selfieUploaded}
                uploading={uploading === "SELFIE"}
                required
                accept="image/*"
                capture="user"
                onUpload={(file) => uploadDocument("SELFIE", file)}
              />

              {/* 10-second Liveness Video */}
              <div className={`rounded-xl border p-4 ${videoCompleted ? "border-emerald-200 bg-emerald-50" : "border-ink-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-3">
                  {videoCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <FileText className="h-5 w-5 text-ink-400" />
                  )}
                  <p className="text-sm font-medium text-ink-900">
                    10-Second Liveness Video <span className="text-rose-500">*</span>
                  </p>
                </div>
                {videoCompleted ? (
                  <p className="text-xs text-emerald-700">Video captured successfully</p>
                ) : (
                  <LivenessVideoCapture onComplete={() => setVideoCompleted(true)} />
                )}
              </div>
            </div>
          )}

          {/* Step 8: All Required Documents */}
          {step === 8 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <FileText className="h-5 w-5" />
                <h2 className="font-bold">Documents Collection</h2>
              </div>
              <p className="text-sm text-ink-600">
                Upload all the required documents listed below. GPS-tagged photos
                must have location data embedded in the image.
              </p>

              {nameMismatch && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  Name mismatch detected — please ensure documents clearly show your legal name.
                </div>
              )}

              <div className="space-y-3">
                {REQUIRED_DOCUMENTS.map((doc) => (
                  <DocumentUploadField
                    key={doc.type}
                    label={doc.label}
                    type={doc.type}
                    uploaded={!!uploadedDocs[doc.type]}
                    uploading={uploading === doc.type}
                    required={doc.required}
                    accept={doc.accept}
                    description={doc.description}
                    requiresGps={doc.requiresGps}
                    onUpload={(file) =>
                      uploadDocument(doc.type, file, { requiresGps: doc.requiresGps })
                    }
                  />
                ))}
              </div>

              <div className="mt-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-500">
                <strong>Note:</strong> For GPS-tagged photos, please ensure location
                services are enabled on your phone&apos;s camera before taking the photo.
              </div>
            </div>
          )}

          {/* Step 9: Personal Details + Set Password */}
          {step === 9 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <User className="h-5 w-5" />
                <h2 className="font-bold">Business Details &amp; Password</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Full Name (as per documents) *</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label>Shop / Firm Name *</Label>
                  <Input
                    required
                    value={form.shopName}
                    onChange={(e) => updateForm("shopName", e.target.value)}
                    placeholder="Business name"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Shop Address</Label>
                  <Input
                    value={form.shopAddress}
                    onChange={(e) => updateForm("shopAddress", e.target.value)}
                    placeholder="Full address"
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label>Pin Code *</Label>
                  <Input
                    required
                    maxLength={6}
                    value={form.pincode}
                    onChange={(e) => updateForm("pincode", e.target.value)}
                    placeholder="110001"
                  />
                </div>
                <div>
                  <Label>State *</Label>
                  <Select
                    value={form.state}
                    onChange={(e) => updateForm("state", e.target.value)}
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={form.dob}
                    onChange={(e) => updateForm("dob", e.target.value)}
                  />
                </div>
              </div>

              <hr className="border-ink-100" />

              <div className="flex items-center gap-2 text-brand-700">
                <Lock className="h-5 w-5" />
                <h2 className="font-bold">Set Your Password</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateForm("password", e.target.value)}
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <Label>Confirm Password *</Label>
                  <Input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) =>
                      updateForm("confirmPassword", e.target.value)
                    }
                    placeholder="Re-enter password"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                  Registration Summary
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p>
                    <span className="text-ink-500">Phone:</span>{" "}
                    {phoneVerified ? "\u2713 Verified" : "\u2717 Not verified"}
                  </p>
                  <p>
                    <span className="text-ink-500">Email:</span>{" "}
                    {emailVerified ? "\u2713 Verified" : "\u2717 Not verified"}
                  </p>
                  <p>
                    <span className="text-ink-500">Aadhaar:</span>{" "}
                    {aadhaarVerified
                      ? `\u2713 ${form.aadhaarName || "Verified"}`
                      : "\u2717 Not verified"}
                  </p>
                  <p>
                    <span className="text-ink-500">PAN:</span>{" "}
                    {panResult
                      ? `\u2713 ${form.panNumber}`
                      : form.panNumber || "\u2014"}
                  </p>
                  <p>
                    <span className="text-ink-500">Bank:</span>{" "}
                    {bankResult ? "\u2713 Verified" : "\u2014"}
                  </p>
                  <p>
                    <span className="text-ink-500">GST:</span>{" "}
                    {gstResult
                      ? `\u2713 ${form.gstin}`
                      : form.gstin || "Skipped"}
                  </p>
                  <p>
                    <span className="text-ink-500">Selfie &amp; Video:</span>{" "}
                    {selfieUploaded && videoCompleted
                      ? "\u2713 Complete"
                      : `${selfieUploaded ? "Selfie \u2713" : ""} ${videoCompleted ? "Video \u2713" : ""}`}
                  </p>
                  <p>
                    <span className="text-ink-500">Documents:</span>{" "}
                    {Object.keys(uploadedDocs).length}/{REQUIRED_DOCUMENTS.length} uploaded
                  </p>
                  {form.msmeNumber && (
                    <p>
                      <span className="text-ink-500">MSME:</span>{" "}
                      {form.msmeNumber}
                    </p>
                  )}
                  <p>
                    <span className="text-ink-500">Name Match:</span>{" "}
                    {nameMismatch ? (
                      <span className="text-amber-600">Mismatch (docs uploaded)</span>
                    ) : (
                      <span className="text-emerald-600">All match</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 0}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
              >
                {step === 0 ? "Get Started" : "Continue"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={verifying || !canProceed()}
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Submit Registration
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Helper Components -----

function NameMatchBadge({
  label,
  name1,
  name2,
}: {
  label: string;
  name1: string;
  name2: string;
}) {
  const match = namesMatch(name1, name2);
  return (
    <div
      className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
        match
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {match ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span>
        Name {match ? "matches" : "mismatch"} with {label}:{" "}
        <strong>{name1}</strong> vs <strong>{name2}</strong>
      </span>
    </div>
  );
}

function DocumentUploadField({
  label,
  type,
  uploaded,
  uploading,
  required,
  accept,
  capture,
  description,
  requiresGps,
  onUpload,
}: {
  label: string;
  type: string;
  uploaded: boolean;
  uploading: boolean;
  required?: boolean;
  accept?: string;
  capture?: string;
  description?: string;
  requiresGps?: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        uploaded
          ? "border-emerald-200 bg-emerald-50"
          : "border-ink-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {uploaded ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <FileText className="h-5 w-5 shrink-0 text-ink-400" />
          )}
          <div>
            <p className="text-sm font-medium text-ink-900">
              {label} {required && <span className="text-rose-500">*</span>}
              {requiresGps && (
                <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  GPS
                </span>
              )}
            </p>
            {description && !uploaded && (
              <p className="text-xs text-ink-500">{description}</p>
            )}
            {uploaded && (
              <p className="text-xs text-emerald-700">Uploaded successfully</p>
            )}
          </div>
        </div>
        {!uploaded && (
          <label className="cursor-pointer shrink-0">
            <input
              type="file"
              accept={accept || "image/*,.pdf"}
              capture={capture as any}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
              disabled={uploading}
            />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
