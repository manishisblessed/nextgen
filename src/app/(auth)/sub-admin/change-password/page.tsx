"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

type Rule = { label: string; ok: boolean };

function evaluate(pwd: string): Rule[] {
  return [
    { label: "At least 10 characters", ok: pwd.length >= 10 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(pwd) },
    { label: "One lowercase letter", ok: /[a-z]/.test(pwd) },
    { label: "One number", ok: /\d/.test(pwd) },
    {
      label: "One special character (@ # $ % & * etc.)",
      ok: /[^A-Za-z0-9]/.test(pwd),
    },
  ];
}

export default function SubAdminChangePasswordPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rules = useMemo(() => evaluate(next), [next]);
  const allValid = rules.every((r) => r.ok);
  const matches = next.length > 0 && next === confirm;

  const name = session?.user?.name ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!allValid) {
      setError("Please satisfy every password requirement below.");
      return;
    }
    if (!matches) {
      setError("Confirmation does not match the new password.");
      return;
    }
    if (next === current) {
      setError("Your new password must be different from the temporary one.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not change password.");
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="flex items-center gap-3 text-ink-500">
          <span className="h-3 w-3 animate-pulse rounded-full bg-brand-500" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
      <div className="hidden flex-col justify-between rounded-3xl bg-gradient-to-br from-slate-700 via-slate-800 to-brand-600 p-10 text-white shadow-glow lg:flex">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
            <ShieldCheck className="h-3.5 w-3.5" /> First-time login
          </span>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight">
            Set a password <br /> only you know.
          </h2>
          <p className="mt-3 text-white/80">
            For your security we never let auto-generated passwords stay active.
            Pick a strong, unique password before you continue to the sub-admin
            console.
          </p>
        </div>

        <div className="space-y-3 text-sm">
          {[
            "Never reuse a password from another service",
            "Store it in your password manager",
            "Don't share it — even with the Admin who created your account",
            "We will ask you to change it every 90 days",
          ].map((t) => (
            <div key={t} className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              {t}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-ink-100 bg-white p-8 shadow-soft md:p-10">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-700 text-white">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="heading-md">Change your password</h1>
            <p className="text-sm text-ink-500">
              Welcome, <strong className="text-ink-900">{name}</strong>. Replace
              the temporary password issued by Admin to continue.
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="cur">Temporary password</Label>
            <div className="relative">
              <Input
                id="cur"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900"
                aria-label={showCurrent ? "Hide" : "Show"}
              >
                {showCurrent ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="new">New password</Label>
            <div className="relative">
              <Input
                id="new"
                type={showNew ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900"
                aria-label={showNew ? "Hide" : "Show"}
              >
                {showNew ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type={showNew ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <ul className="grid grid-cols-1 gap-1.5 rounded-xl border border-ink-100 bg-ink-50/40 p-3 text-xs sm:grid-cols-2">
            {rules.map((r) => (
              <li
                key={r.label}
                className={`flex items-center gap-2 ${r.ok ? "text-emerald-700" : "text-ink-500"}`}
              >
                {r.ok ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                {r.label}
              </li>
            ))}
            <li
              className={`flex items-center gap-2 sm:col-span-2 ${matches ? "text-emerald-700" : "text-ink-500"}`}
            >
              {matches ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Confirmation matches
            </li>
          </ul>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || !allValid || !matches}
          >
            {submitting ? (
              "Saving..."
            ) : (
              <>
                Set password & continue <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
