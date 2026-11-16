"use client";

import { ShieldCheck, KeyRound, ChevronRight, RotateCcw } from "lucide-react";

export type LoginMethod = "2fa" | "pinlogin";

interface LoginMethodChoiceProps {
  userName: string;
  /** Called with the factor the user picked. */
  onChoose: (method: LoginMethod) => void;
  onBack: () => void;
}

/**
 * Second-factor chooser — shown when a user has BOTH an authenticator app AND
 * a transaction PIN set up. The user decides, on every sign-in, whether to
 * verify with their authenticator or their transaction PIN. Neither option is
 * forced; the choice is theirs, every time.
 */
export function LoginMethodChoice({ userName, onChoose, onBack }: LoginMethodChoiceProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            Step 2 of 2
          </p>
          <h2 className="heading-md">How do you want to verify?</h2>
          <p className="text-sm text-ink-500">
            Hi {userName}, pick the second factor you&apos;d like to use
            today. You can switch any time.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onChoose("2fa")}
          className="group flex w-full items-center gap-4 rounded-2xl border border-ink-100 p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50/60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              Authenticator app
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Most Secure
              </span>
            </span>
            <span className="block text-xs text-ink-500">
              Enter the 6-digit code from Google Authenticator, Authy, etc.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </button>

        <button
          type="button"
          onClick={() => onChoose("pinlogin")}
          className="group flex w-full items-center gap-4 rounded-2xl border border-ink-100 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <KeyRound className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              Transaction PIN
              <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700">
                Quick
              </span>
            </span>
            <span className="block text-xs text-ink-500">
              Sign in with your 4–6 digit TPIN.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
        </button>
      </div>

      <div className="flex justify-end text-xs">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 font-medium text-ink-500 hover:text-ink-900"
        >
          <RotateCcw className="h-3 w-3" />
          Start over
        </button>
      </div>
    </div>
  );
}
