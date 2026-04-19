"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  UserCog,
  ArrowRight,
  KeyRound,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { saveSession } from "@/lib/auth";
import {
  findSubAdminByEmail,
  recordLogin,
  verifyPassword
} from "@/lib/subAdmins";

export default function SubAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const record = findSubAdminByEmail(email);
      if (!record) {
        throw new Error(
          "No sub-admin found for that email. Ask the Admin to create one for you."
        );
      }
      if (record.status === "Suspended") {
        throw new Error(
          "This sub-admin account has been suspended. Please contact the Admin."
        );
      }
      const ok = await verifyPassword(password, record.passwordHash);
      if (!ok) throw new Error("Incorrect password.");

      recordLogin(record.email);

      saveSession({
        name: record.name,
        email: record.email,
        phone: record.phone,
        role: "sub-admin",
        walletBalance: 0,
        loggedInAt: Date.now(),
        mustChangePassword: record.mustChangePassword,
        userCode: record.id
      });

      router.push(
        record.mustChangePassword ? "/sub-admin/change-password" : "/dashboard"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
      <div className="hidden flex-col justify-between rounded-3xl bg-gradient-to-br from-slate-700 via-slate-800 to-brand-600 p-10 text-white shadow-glow lg:flex">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
            <UserCog className="h-3.5 w-3.5" /> Operations · Sub-Admin
          </span>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight">
            Day-to-day operations, <br /> delegated by Admin.
          </h2>
          <p className="mt-3 text-white/80">
            Approve KYC, monitor settlements, manage billers and assist
            retailers — without full system or audit access.
          </p>
        </div>

        <div className="space-y-3">
          {[
            "Created by your Admin with a one-time password",
            "You'll be forced to change the password on first login",
            "Every action attributed to your sub-admin ID",
            "Need full access? Use the Admin login"
          ].map((t) => (
            <div key={t} className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              {t}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-ink-100 bg-white p-8 shadow-soft md:p-10">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-700 text-white">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <h1 className="heading-md">Sub-Admin sign in</h1>
            <p className="text-sm text-ink-500">
              Use the credentials issued by your Admin.
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="email">Sub-admin email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops.user@payprismindia.com"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="#"
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Temporary password from Admin"
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900"
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="otp">OTP</Label>
            <div className="relative">
              <Input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code sent to your mobile"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              Demo build — any 6-digit code works.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              "Verifying..."
            ) : (
              <>
                Sign in as Sub-Admin <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-ink-500">
            Are you the platform owner?{" "}
            <Link href="/admin" className="font-semibold text-brand-700">
              Use the admin login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
