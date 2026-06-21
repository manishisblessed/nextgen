"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Crown,
  ArrowRight,
  KeyRound,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function MasterAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("masteradmin@jmpnextgenpay.com");
  const [password, setPassword] = useState("Demo@1234");
  const [otp, setOtp] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      identifier: email.trim(),
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials or insufficient permissions.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
      <div className="hidden flex-col justify-between rounded-3xl bg-gradient-to-br from-violet-900 via-violet-800 to-brand-700 p-10 text-white shadow-glow lg:flex">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
            <Crown className="h-3.5 w-3.5" /> Master Admin · Platform Owner
          </span>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight">
            NextGenPay Master <br /> Control Centre.
          </h2>
          <p className="mt-3 text-white/80">
            Full platform authority — manage admins, assign permissions,
            oversee every operation, and control the entire system.
          </p>
        </div>

        <div className="space-y-3">
          {[
            "Create & manage Admin accounts",
            "Assign tabs & permissions to each Admin",
            "Full access to all platform features",
            "Hardware-key + OTP enforced"
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
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-800 text-white">
            <Crown className="h-5 w-5" />
          </span>
          <div>
            <h1 className="heading-md">Master Admin sign in</h1>
            <p className="text-sm text-ink-500">
              Platform owner access only.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="email">Master Admin email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <Label htmlFor="otp">2FA code</Label>
            <div className="relative">
              <Input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code from authenticator"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              2FA will be enforced in production.
            </p>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              "Verifying..."
            ) : (
              <>
                Enter master console <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-ink-500">
            Admin?{" "}
            <Link href="/admin" className="font-semibold text-brand-700">
              Use the admin login
            </Link>
          </p>

          <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50 p-3 text-xs text-ink-600">
            <span className="font-semibold text-ink-900">Credentials:</span>{" "}
            <span className="font-mono">masteradmin@jmpnextgenpay.com</span> / <span className="font-mono">Demo@1234</span>
          </div>
        </form>
      </div>
    </div>
  );
}
