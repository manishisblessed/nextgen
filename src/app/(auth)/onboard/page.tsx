"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Building2,
  CreditCard,
  User,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";

type InviteData = {
  id: string;
  phone: string;
  email: string;
  role: string;
  name: string | null;
  status: string;
  expiresAt: string;
};

type Verification = {
  type: string;
  status: string;
  verifiedName: string | null;
};

const STEPS = [
  "Welcome",
  "Personal Details",
  "PAN Verification",
  "Bank Verification",
  "GST (Optional)",
  "Set Password",
] as const;

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
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    gstin: "",
    password: "",
    confirmPassword: "",
  });

  // Verification results
  const [panResult, setPanResult] = useState<any>(null);
  const [bankResult, setBankResult] = useState<any>(null);
  const [gstResult, setGstResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid onboarding link. No token found.");
      setLoading(false);
      return;
    }
    fetchInvite();
  }, [token]);

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
    setLoading(false);
  }

  function updateForm(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function verifyPan() {
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.panNumber.toUpperCase())) {
      setError("Invalid PAN format. Expected: ABCDE1234F");
      return;
    }
    setVerifying(true);
    setError("");
    const res = await fetch(`/api/onboard/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "PAN_360", pan: form.panNumber.toUpperCase() }),
    });
    const data = await res.json();
    setVerifying(false);
    if (data.ok) {
      setPanResult(data.data);
      setForm((f) => ({
        ...f,
        panNumber: f.panNumber.toUpperCase(),
        name: f.name || data.data.registered_name,
        dob: data.data.date_of_birth || f.dob,
      }));
    } else {
      setError(data.message ?? "PAN verification failed");
    }
  }

  async function verifyBank() {
    if (!form.bankAccountNumber || !form.bankIfsc) {
      setError("Please enter account number and IFSC");
      return;
    }
    setVerifying(true);
    setError("");
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
    setVerifying(false);
    if (data.ok) {
      setBankResult(data.data);
      setForm((f) => ({ ...f, bankIfsc: f.bankIfsc.toUpperCase() }));
    } else {
      setError(data.message ?? "Bank verification failed");
    }
  }

  async function verifyGst() {
    if (!form.gstin || form.gstin.length !== 15) {
      setError("Please enter a valid 15-character GSTIN");
      return;
    }
    setVerifying(true);
    setError("");
    const res = await fetch(`/api/onboard/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "GST", gst: form.gstin.toUpperCase() }),
    });
    const data = await res.json();
    setVerifying(false);
    if (data.ok) {
      setGstResult(data.data);
    } else {
      setError(data.message ?? "GST verification failed");
    }
  }

  async function handleSubmit() {
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setVerifying(true);
    setError("");
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
        aadhaarLast4: form.aadhaarLast4 || undefined,
        gstin: form.gstin.toUpperCase() || undefined,
        bankAccountNumber: form.bankAccountNumber || undefined,
        bankIfsc: form.bankIfsc.toUpperCase() || undefined,
        bankName: bankResult?.nameAtBank || form.bankName || undefined,
        dob: form.dob || undefined,
      }),
    });
    const data = await res.json();
    setVerifying(false);

    if (data.ok) {
      setDone(true);
    } else {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Registration failed. Please try again."
      );
    }
  }

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
          <h2 className="mt-4 text-xl font-bold text-ink-900">Registration Complete!</h2>
          <p className="mt-2 text-ink-600">
            Your details have been submitted for admin approval. You&apos;ll receive a notification once approved.
          </p>
          <Button className="mt-6" onClick={() => router.push("/login")}>
            Go to Login <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

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
            <strong>{invite?.role.replace("_", " ")}</strong>
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                  i < step
                    ? "bg-emerald-500 text-white"
                    : i === step
                    ? "bg-brand-600 text-white"
                    : "bg-ink-100 text-ink-500"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={`text-xs ${i === step ? "font-semibold text-ink-900" : "text-ink-500"}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-ink-200" />}
            </div>
          ))}
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
                <strong>{invite?.role.replace("_", " ")}</strong> on NextGenPay.
              </p>
              <div className="rounded-xl bg-ink-50 p-4 text-left text-sm">
                <p><strong>Email:</strong> {invite?.email}</p>
                <p><strong>Phone:</strong> {invite?.phone}</p>
                <p><strong>Expires:</strong> {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : "—"}</p>
              </div>
              <p className="text-sm text-ink-500">
                You&apos;ll need your PAN card, bank account details, and optionally your GSTIN to complete registration.
              </p>
            </div>
          )}

          {/* Step 1: Personal Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <User className="h-5 w-5" />
                <h2 className="font-bold">Personal & Business Details</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Full Name (as per PAN) *</Label>
                  <Input required value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <Label>Shop / Firm Name *</Label>
                  <Input required value={form.shopName} onChange={(e) => updateForm("shopName", e.target.value)} placeholder="Business name" />
                </div>
                <div className="md:col-span-2">
                  <Label>Shop Address</Label>
                  <Input value={form.shopAddress} onChange={(e) => updateForm("shopAddress", e.target.value)} placeholder="Full address" />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => updateForm("city", e.target.value)} placeholder="City" />
                </div>
                <div>
                  <Label>Pin Code *</Label>
                  <Input required maxLength={6} value={form.pincode} onChange={(e) => updateForm("pincode", e.target.value)} placeholder="110001" />
                </div>
                <div>
                  <Label>State *</Label>
                  <Select value={form.state} onChange={(e) => updateForm("state", e.target.value)}>
                    {["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input type="date" value={form.dob} onChange={(e) => updateForm("dob", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: PAN Verification */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <CreditCard className="h-5 w-5" />
                <h2 className="font-bold">PAN Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                Enter your PAN number. We&apos;ll verify it instantly using government records.
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label>PAN Number *</Label>
                  <Input
                    value={form.panNumber}
                    onChange={(e) => updateForm("panNumber", e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="uppercase"
                  />
                </div>
                <Button
                  type="button"
                  onClick={verifyPan}
                  disabled={verifying || form.panNumber.length !== 10}
                >
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify
                </Button>
              </div>
              {panResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">✓ PAN Verified</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                    <p><span className="text-emerald-700">Name:</span> {panResult.registered_name}</p>
                    <p><span className="text-emerald-700">Type:</span> {panResult.type}</p>
                    <p><span className="text-emerald-700">DOB:</span> {panResult.date_of_birth}</p>
                    <p><span className="text-emerald-700">Aadhaar Linked:</span> {panResult.aadhaar_linked ? "Yes" : "No"}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Bank Verification */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Building2 className="h-5 w-5" />
                <h2 className="font-bold">Bank Account Verification</h2>
              </div>
              <p className="text-sm text-ink-600">
                We&apos;ll verify your bank account via Penny Drop (₹1 deposit).
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Account Number *</Label>
                  <Input
                    value={form.bankAccountNumber}
                    onChange={(e) => updateForm("bankAccountNumber", e.target.value)}
                    placeholder="Enter account number"
                  />
                </div>
                <div>
                  <Label>IFSC Code *</Label>
                  <Input
                    value={form.bankIfsc}
                    onChange={(e) => updateForm("bankIfsc", e.target.value.toUpperCase())}
                    placeholder="SBIN0001234"
                    maxLength={11}
                    className="uppercase"
                  />
                </div>
              </div>
              <Button
                type="button"
                onClick={verifyBank}
                disabled={verifying || !form.bankAccountNumber || !form.bankIfsc}
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify Bank Account
              </Button>
              {bankResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">✓ Bank Account Verified</p>
                  <div className="mt-2 text-sm">
                    <p><span className="text-emerald-700">Name at Bank:</span> {bankResult.nameAtBank}</p>
                    <p><span className="text-emerald-700">UTR:</span> {bankResult.utr}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: GST (Optional) */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Building2 className="h-5 w-5" />
                <h2 className="font-bold">GST Verification (Optional)</h2>
              </div>
              <p className="text-sm text-ink-600">
                If you have a GSTIN, enter it here for verification. You can skip this step.
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label>GSTIN</Label>
                  <Input
                    value={form.gstin}
                    onChange={(e) => updateForm("gstin", e.target.value.toUpperCase())}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    className="uppercase"
                  />
                </div>
                <Button
                  type="button"
                  onClick={verifyGst}
                  disabled={verifying || form.gstin.length !== 15}
                >
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify
                </Button>
              </div>
              {gstResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">✓ GST Verified</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                    <p><span className="text-emerald-700">Legal Name:</span> {gstResult.legal_name}</p>
                    <p><span className="text-emerald-700">Trade Name:</span> {gstResult.trade_name}</p>
                    <p><span className="text-emerald-700">Status:</span> {gstResult.gst_status}</p>
                    <p><span className="text-emerald-700">Type:</span> {gstResult.taxpayer_type}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Set Password */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-700">
                <Lock className="h-5 w-5" />
                <h2 className="font-bold">Set Your Password</h2>
              </div>
              <p className="text-sm text-ink-600">
                Choose a strong password for your account.
              </p>
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
                    onChange={(e) => updateForm("confirmPassword", e.target.value)}
                    placeholder="Re-enter password"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">Registration Summary</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <p><span className="text-ink-500">Name:</span> {form.name}</p>
                  <p><span className="text-ink-500">Shop:</span> {form.shopName}</p>
                  <p><span className="text-ink-500">PAN:</span> {panResult ? `✓ ${form.panNumber}` : form.panNumber || "—"}</p>
                  <p><span className="text-ink-500">Bank:</span> {bankResult ? "✓ Verified" : "—"}</p>
                  <p><span className="text-ink-500">GST:</span> {gstResult ? `✓ ${form.gstin}` : form.gstin || "Skipped"}</p>
                  <p><span className="text-ink-500">State:</span> {form.state}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setStep(Math.max(0, step - 1)); setError(""); }}
              disabled={step === 0}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={() => { setStep(step + 1); setError(""); }}
              >
                {step === 0 ? "Get Started" : "Continue"} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={verifying || !form.password || !form.name || !form.shopName}
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit Registration
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
