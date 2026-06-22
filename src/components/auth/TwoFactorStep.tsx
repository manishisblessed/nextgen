"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ShieldCheck, ArrowRight, AlertCircle, KeyRound, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

interface TwoFactorStepProps {
  tempToken: string;
  userName: string;
  userEmail: string;
  onBack: () => void;
}

export function TwoFactorStep({ tempToken, userName, userEmail, onBack }: TwoFactorStepProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, [useBackup]);

  const verify = useCallback(async (verifyCode?: string) => {
    const toVerify = (verifyCode ?? code).trim();
    if (!toVerify || verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/2fa/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempToken,
          code: toVerify,
          type: useBackup ? "backup" : "totp",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        if (data.remainingAttempts !== undefined) {
          setRemaining(data.remainingAttempts);
        }
        setLoading(false);
        setCode("");
        verifyingRef.current = false;
        return;
      }

      const result = await signIn("token-login", {
        grant: data.grant,
        redirect: false,
      });

      if (result?.error) {
        setError("Session creation failed. Please try again.");
        setLoading(false);
        verifyingRef.current = false;
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      setCode("");
      verifyingRef.current = false;
    }
  }, [code, tempToken, useBackup, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    verify();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="heading-md">Two-factor authentication</h2>
          <p className="text-sm text-ink-500">
            Hi {userName}, enter the code from your authenticator app.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          {remaining !== null && remaining > 0 && (
            <span className="ml-auto text-xs font-medium">
              {remaining} attempt{remaining !== 1 ? "s" : ""} left
            </span>
          )}
        </div>
      )}

      {remaining === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Too many failed attempts. Please start over.
          <button
            onClick={onBack}
            className="ml-2 font-semibold underline"
          >
            Back to login
          </button>
        </div>
      )}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="2fa-code">
            {useBackup ? "Backup code" : "6-digit code"}
          </Label>
          <div className="relative">
            <Input
              ref={inputRef}
              id="2fa-code"
              inputMode={useBackup ? "text" : "numeric"}
              maxLength={useBackup ? 9 : 6}
              placeholder={useBackup ? "xxxx-xxxx" : "000000"}
              value={code}
              onChange={(e) => {
                if (useBackup) {
                  setCode(e.target.value);
                } else {
                  const val = e.target.value.replace(/\D/g, "");
                  setCode(val);
                  if (val.length === 6) verify(val);
                }
              }}
              disabled={loading}
              autoComplete="one-time-code"
              className={useBackup ? "" : "text-center text-lg font-mono tracking-[0.3em]"}
              required
            />
            {!loading && (
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            )}
          </div>
          {!useBackup && !loading && (
            <p className="mt-1 text-[11px] text-ink-500">
              Open Google Authenticator, Authy, or Microsoft Authenticator
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-3 text-sm font-medium text-brand-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            Verifying...
          </div>
        ) : (
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={remaining === 0 || (!useBackup && code.length !== 6)}
          >
            Verify & sign in <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </form>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setUseBackup(!useBackup);
            setCode("");
            setError("");
          }}
          disabled={loading}
          className="font-medium text-brand-700 hover:underline disabled:opacity-50"
        >
          {useBackup ? "Use authenticator app" : "Use a backup code"}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex items-center gap-1 font-medium text-ink-500 hover:text-ink-900 disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          Start over
        </button>
      </div>
    </div>
  );
}
