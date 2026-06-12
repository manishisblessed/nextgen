"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { saveSession, demoSession, type Role } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    shopName: "",
    state: "Delhi",
    role: "retailer"
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    saveSession({
      ...demoSession,
      name: form.name || demoSession.name,
      email: form.email || demoSession.email,
      phone: form.phone || demoSession.phone,
      role: form.role as Role
    });
    router.push("/dashboard");
  }

  return (
    <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
      <div className="hidden flex-col justify-between rounded-3xl bg-gradient-to-br from-accent-500 via-brand-600 to-brand-700 p-10 text-white shadow-glow lg:flex">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
            Become an Agent
          </span>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight">
            Start earning from your{" "}
            <span className="bg-gradient-to-r from-amber-200 to-white bg-clip-text text-transparent">
              very first transaction.
            </span>
          </h2>
          <p className="mt-3 text-white/85">
            Sign up in 60 seconds. Complete eKYC. Go live with 60+ services.
          </p>
        </div>

        <ul className="space-y-3 text-sm">
          {[
            "Zero joining fee, zero hidden charges",
            "Free RuPay business card on activation",
            "Earn up to 1.2% commission per transaction",
            "24×7 WhatsApp & phone support"
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-3xl border border-ink-100 bg-white p-8 shadow-soft md:p-10">
        <h1 className="heading-md">Create your NextGenPay account</h1>
        <p className="mt-2 text-sm text-ink-500">
          Already a member?{" "}
          <Link href="/login" className="font-semibold text-brand-700">
            Login here
          </Link>
        </p>

        <form className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <div className="sm:col-span-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="As per Aadhaar"
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Mobile</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="10-digit mobile"
              required
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@email.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="shopName">Shop / Business name</Label>
            <Input
              id="shopName"
              value={form.shopName}
              onChange={(e) => update("shopName", e.target.value)}
              placeholder="e.g. Sharma Mobile World"
            />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <Select
              id="state"
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
            >
              {[
                "Delhi",
                "Uttar Pradesh",
                "Bihar",
                "Maharashtra",
                "Karnataka",
                "Tamil Nadu",
                "West Bengal",
                "Punjab",
                "Rajasthan",
                "Gujarat",
                "Other"
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Account type</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["retailer", "distributor", "master-distributor"] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => update("role", r)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition ${
                    form.role === r
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                defaultChecked
                required
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              I agree to NextGenPay's{" "}
              <Link href="/legal/terms" className="font-semibold text-brand-700">
                Terms
              </Link>{" "}
              &{" "}
              <Link href="/legal/privacy" className="font-semibold text-brand-700">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create my agent account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
