"use client";

import { useEffect, useState } from "react";
import { User, Save, BadgeCheck, ShieldCheck } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getSession, saveSession, type Session } from "@/lib/auth";

export default function ProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSession(getSession());
  }, []);

  if (!session) return null;

  function update<K extends keyof Session>(k: K, v: Session[K]) {
    if (!session) return;
    setSession({ ...session, [k]: v });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    saveSession(session);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <ServicePageHeader
        icon={User}
        title="Profile"
        description="Manage your personal details, KYC status and account preferences."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <aside className="rounded-2xl border border-ink-100 bg-white p-6 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-display text-xl font-bold text-white shadow-glow">
            {session.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink-900">
            {session.name}
          </h2>
          <p className="text-xs text-ink-500">{session.email}</p>
          <Badge variant="brand" className="mt-3 capitalize">
            {session.role}
          </Badge>

          <div className="mt-6 space-y-3 text-left">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <BadgeCheck className="h-4 w-4" />
              Aadhaar verified
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <BadgeCheck className="h-4 w-4" />
              PAN verified
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              2FA enabled
            </div>
          </div>
        </aside>

        <form onSubmit={save} className="lg:col-span-2 grid gap-4 rounded-2xl border border-ink-100 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={session.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={session.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={session.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="role">Account type</Label>
            <Select
              id="role"
              value={session.role}
              onChange={(e) =>
                update("role", e.target.value as Session["role"])
              }
            >
              {(["agent", "retailer", "distributor"] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
