"use client";

import { Settings, Bell, ShieldCheck, KeyRound, Smartphone, Mail } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";

const groups = [
  {
    title: "Notifications",
    icon: Bell,
    items: [
      { label: "Transaction alerts (SMS)", on: true },
      { label: "Daily summary email", on: true },
      { label: "Marketing & offers", on: false },
      { label: "Commission credit alerts", on: true }
    ]
  },
  {
    title: "Security",
    icon: ShieldCheck,
    items: [
      { label: "Two-factor authentication (2FA)", on: true },
      { label: "Login alerts to email", on: true },
      { label: "Trusted devices remembered", on: true },
      { label: "Auto-logout after 15 min idle", on: false }
    ]
  },
  {
    title: "Communication preferences",
    icon: Mail,
    items: [
      { label: "WhatsApp updates", on: true },
      { label: "Voice call OTP fallback", on: false }
    ]
  }
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ServicePageHeader
        icon={Settings}
        title="Settings"
        description="Manage your notification, security and communication preferences."
      />

      <div className="space-y-6">
        {groups.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.title} className="rounded-2xl border border-ink-100 bg-white">
              <div className="flex items-center gap-3 border-b border-ink-100 px-6 py-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="font-display text-base font-semibold text-ink-900">
                  {g.title}
                </h3>
              </div>
              <ul className="divide-y divide-ink-100">
                {g.items.map((it) => (
                  <li
                    key={it.label}
                    className="flex items-center justify-between px-6 py-4 text-sm"
                  >
                    <span className="text-ink-700">{it.label}</span>
                    <Toggle defaultOn={it.on} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <div className="rounded-2xl border border-ink-100 bg-white p-6">
          <h3 className="font-display text-base font-semibold text-ink-900">
            Change password
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Use a strong password you don't reuse anywhere else.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <KeyRound className="h-4 w-4 text-ink-500" />
            <button className="text-sm font-semibold text-brand-700 hover:underline">
              Send reset link to my email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ defaultOn }: { defaultOn: boolean }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" defaultChecked={defaultOn} className="peer sr-only" />
      <div className="h-6 w-11 rounded-full bg-ink-200 transition peer-checked:bg-brand-600" />
      <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </label>
  );
}
