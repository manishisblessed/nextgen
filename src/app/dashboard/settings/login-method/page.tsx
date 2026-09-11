"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ShieldCheck,
  KeyRound,
  HelpCircle,
  Loader2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Preferred = "authenticator" | "tpin" | null;

type State = {
  canChoose: boolean;
  twoFactorEnabled: boolean;
  pinLoginAllowed: boolean;
  hasTxnPin: boolean;
  preferred: Preferred;
};

const OPTIONS: {
  id: Exclude<Preferred, null> | "ask";
  label: string;
  desc: string;
  icon: typeof ShieldCheck;
  accent: string;
}[] = [
  {
    id: "ask",
    label: "Ask me every time",
    desc: "Show the chooser at each login so you can pick on the spot.",
    icon: HelpCircle,
    accent: "text-ink-600",
  },
  {
    id: "authenticator",
    label: "Authenticator app",
    desc: "Skip the chooser and go straight to your 6-digit TOTP code. Most secure.",
    icon: ShieldCheck,
    accent: "text-emerald-600",
  },
  {
    id: "tpin",
    label: "Transaction PIN",
    desc: "Skip the chooser and sign in with your TPIN. Quick and convenient.",
    icon: KeyRound,
    accent: "text-brand-600",
  },
];

export default function LoginMethodSettingsPage() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/security/login-method");
      const data = await res.json();
      if (res.ok) setState(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function choose(id: (typeof OPTIONS)[number]["id"]) {
    const preferred: Preferred = id === "ask" ? null : id;
    setSaving(id);
    try {
      const res = await fetch("/api/security/login-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not save your preference");
      setState((s) => (s ? { ...s, preferred } : s));
      toast.success("Login preference saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your preference");
    } finally {
      setSaving(null);
    }
  }

  const current: (typeof OPTIONS)[number]["id"] = state?.preferred ?? "ask";

  return (
    <div className="mx-auto max-w-2xl">
      <ServicePageHeader
        icon={ShieldCheck}
        title="Login method"
        description="Choose how you'd like to verify your identity when you sign in."
        back="/dashboard/settings"
      />

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-ink-100 bg-white p-10 text-ink-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !state?.canChoose ? (
        <NotAvailable state={state} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            An administrator has allowed you to sign in with your transaction PIN
            <em> or </em> your authenticator app. Pick a default below — you can
            always switch during login.
          </p>
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = current === o.id;
            const busy = saving === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={busy}
                onClick={() => choose(o.id)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
                  active
                    ? "border-brand-500 bg-brand-50 shadow-soft"
                    : "border-ink-100 hover:border-brand-300"
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white",
                    o.accent
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900">
                    {o.label}
                  </span>
                  <span className="block text-xs text-ink-500">{o.desc}</span>
                </span>
                {busy ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />
                ) : active ? (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full border border-ink-200" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotAvailable({ state }: { state: State | null }) {
  const hints: string[] = [];
  if (state && !state.pinLoginAllowed) {
    hints.push(
      "TPIN login hasn't been allowed for your account by an administrator."
    );
  }
  if (state?.pinLoginAllowed && !state.hasTxnPin) {
    hints.push("Set a transaction PIN in Settings → Transaction PIN.");
  }
  if (state?.pinLoginAllowed && !state.twoFactorEnabled) {
    hints.push(
      "Set up an authenticator app to be able to choose between the two methods."
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-900">
            Choosing a login method isn&apos;t available yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            The option to pick between your authenticator app and your
            transaction PIN only appears when both are available.
          </p>
        </div>
      </div>
      {hints.length > 0 && (
        <ul className="ml-8 list-disc space-y-1 text-sm text-amber-800">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      <div className="ml-8 flex flex-wrap gap-3 pt-1">
        <Link
          href="/dashboard/settings/txn-pin"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          Manage Transaction PIN
        </Link>
      </div>
    </div>
  );
}
