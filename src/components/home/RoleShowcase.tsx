"use client";

import { useState } from "react";
import { Store, Users, Network, Lock, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const roles = [
  {
    id: "retailer",
    label: "Retailer",
    icon: Store,
    color: "from-emerald-500 to-brand-500",
    headline: "Run all 60+ services from your shop",
    bullets: [
      "Single dashboard for AePS, DMT, UPI, recharges, bills, travel",
      "Instant IMPS settlement, 24×7 wallet top-up",
      "Highest commissions in the industry",
      "Free RuPay debit card + sound box"
    ],
    visual: "retailer"
  },
  {
    id: "distributor",
    label: "Distributor",
    icon: Users,
    color: "from-brand-500 to-violet-500",
    headline: "Build a network. Earn override commissions.",
    bullets: [
      "Onboard retailers in under 5 minutes",
      "Approve fund requests with one tap",
      "Set commission slabs per service",
      "Live leaderboard of your top retailers"
    ],
    visual: "distributor"
  },
  {
    id: "master",
    label: "Master Distributor",
    icon: Network,
    color: "from-accent-500 to-rose-500",
    headline: "Run a fintech business — under your brand",
    bullets: [
      "White-label portal & app on your domain",
      "Full REST API + webhooks",
      "Override commissions across the tree",
      "Co-branded marketing & creatives"
    ],
    visual: "master"
  },
  {
    id: "admin",
    label: "Platform admin",
    icon: Lock,
    color: "from-ink-700 to-brand-600",
    headline: "Total visibility. Total control.",
    bullets: [
      "KYC queue with DigiLocker auto-verification",
      "Live SLO board for every payment switch",
      "Tamper-proof audit log + WORM storage",
      "Velocity rules, fraud holds, settlement runs"
    ],
    visual: "admin"
  }
] as const;

export function RoleShowcase() {
  const [active, setActive] = useState<(typeof roles)[number]["id"]>("retailer");
  const role = roles.find((r) => r.id === active)!;

  return (
    <section id="tour" className="section relative overflow-hidden">
      <div className="container-x">
        <div className="text-center">
          <span className="eyebrow"><Network className="h-3.5 w-3.5" /> Built for the entire chain</span>
          <h2 className="heading-lg mt-4">
            One platform. <span className="gradient-text">Four superpowers.</span>
          </h2>
          <p className="lead mx-auto mt-3 max-w-2xl">
            Every persona — from village retailer to platform admin — gets a workspace built around <em>their</em> job.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-2 rounded-2xl border border-ink-100 bg-white p-1.5 md:grid-cols-4">
          {roles.map((r) => {
            const Icon = r.icon;
            const a = active === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setActive(r.id)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  a
                    ? `bg-gradient-to-r text-white shadow-soft ${r.color}`
                    : "text-ink-700 hover:bg-ink-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <div key={role.id} className="animate-fade-up">
            <span className={cn("inline-flex rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold uppercase tracking-widest text-white", role.color)}>
              {role.label} workspace
            </span>
            <h3 className="mt-4 font-display text-3xl font-bold text-ink-900 md:text-4xl">
              {role.headline}
            </h3>
            <ul className="mt-6 space-y-3">
              {role.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-base text-ink-700">
                  <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white", role.color)}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-ink-800"
            >
              Try {role.label.toLowerCase()} demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <RoleVisual id={role.id} color={role.color} />
        </div>
      </div>
    </section>
  );
}

function RoleVisual({ id, color }: { id: string; color: string }) {
  return (
    <div className="relative perspective-1200 animate-fade-up">
      <div className={cn("absolute -inset-8 -z-10 rounded-[40px] bg-gradient-to-br opacity-30 blur-3xl", color)} />

      <div
        className="relative rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-glow backdrop-blur preserve-3d"
        style={{ transform: "rotateY(-8deg) rotateX(4deg)" }}
      >
        {id === "retailer" && <RetailerVisual />}
        {id === "distributor" && <DistributorVisual />}
        {id === "master" && <MasterVisual />}
        {id === "admin" && <AdminVisual />}
      </div>
    </div>
  );
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values);
  return (
    <div className="flex h-20 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex-1">
          <div
            className={cn("rounded-t-md bg-gradient-to-t", color)}
            style={{ height: `${(v / max) * 100}%`, minHeight: "8%" }}
          />
        </div>
      ))}
    </div>
  );
}

function RetailerVisual() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-500">Wallet</p>
          <p className="font-display text-xl font-bold">₹ 28,450</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">+₹ 2,184 today</span>
      </div>
      <MiniBars values={[12, 18, 14, 22, 28, 24, 32, 30, 36, 42, 38, 48]} color="from-brand-600 to-emerald-500" />
      <div className="grid grid-cols-4 gap-2">
        {["AePS", "DMT", "UPI", "Bills"].map((s) => (
          <div key={s} className="rounded-lg bg-ink-50 p-2 text-center text-xs font-semibold">{s}</div>
        ))}
      </div>
    </div>
  );
}

function DistributorVisual() {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-ink-500">My retailers · 86</p>
      {[
        { n: "Aman Sharma", t: "₹ 184k", c: "Active" },
        { n: "Mukesh Kumar", t: "₹ 312k", c: "Active" },
        { n: "Priya Sharma", t: "₹ 145k", c: "Active" }
      ].map((r) => (
        <div key={r.n} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2">
          <div>
            <p className="text-sm font-semibold">{r.n}</p>
            <p className="text-xs text-ink-500">MTD turnover</p>
          </div>
          <span className="font-display font-bold">{r.t}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-600 to-violet-500 p-3 text-white">
        <p className="text-sm font-semibold">12 fund requests pending</p>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs">Review →</span>
      </div>
    </div>
  );
}

function MasterVisual() {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-ink-500">kapoorpay.in · live</p>
      <div className="rounded-xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-4 text-white">
        <p className="text-[10px] uppercase tracking-widest opacity-80">KapoorPay</p>
        <p className="mt-1 font-display text-base font-bold">Bharat ka apna fintech</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-ink-100 p-3">
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Distributors</p>
          <p className="font-display text-lg font-bold">3</p>
        </div>
        <div className="rounded-xl border border-ink-100 p-3">
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Retailers</p>
          <p className="font-display text-lg font-bold">482</p>
        </div>
        <div className="rounded-xl border border-ink-100 p-3">
          <p className="text-[10px] uppercase tracking-widest text-ink-500">API calls / day</p>
          <p className="font-display text-lg font-bold">4.2M</p>
        </div>
        <div className="rounded-xl border border-ink-100 p-3">
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Override · MTD</p>
          <p className="font-display text-lg font-bold">₹ 18.4L</p>
        </div>
      </div>
    </div>
  );
}

function AdminVisual() {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-ink-500">Platform health · live</p>
      {[
        { l: "AePS Switch", v: "99.98%", t: "412 ms", ok: true },
        { l: "DMT IMPS", v: "99.99%", t: "286 ms", ok: true },
        { l: "BBPS", v: "99.92%", t: "642 ms", ok: false }
      ].map((r) => (
        <div key={r.l} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", r.ok ? "bg-emerald-500" : "bg-amber-500")} />
            <p className="text-sm font-semibold">{r.l}</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold">{r.v}</p>
            <p className="text-ink-500">{r.t}</p>
          </div>
        </div>
      ))}
      <div className="rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 p-3 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Velocity rule fired</p>
        <p className="font-display text-sm font-bold">JNPR3217 · 18 AePS in 12 mins · auto-hold</p>
      </div>
    </div>
  );
}
