import Link from "next/link";
import { ArrowRight, ShieldCheck, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { heroStats } from "@/lib/data";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero-radial">
      <div className="absolute inset-x-0 top-0 -z-10 h-[800px] bg-gradient-to-b from-brand-50/60 to-transparent" />
      <div className="container-x grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <span className="eyebrow animate-fade-up">
            <Sparkles className="h-3.5 w-3.5" />
            Banking that builds Bharat
          </span>
          <h1 className="heading-xl mt-5 animate-fade-up [animation-delay:80ms]">
            Smart Banking for a{" "}
            <span className="gradient-text">Smarter Bharat</span>
          </h1>
          <p className="lead mt-5 max-w-2xl animate-fade-up [animation-delay:160ms]">
            Become a NextGenPay agent and offer 60+ digital services —
            money transfer, AePS, recharges, bill payments, travel bookings —
            from a single dashboard. Earn high commissions, settle instantly.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up [animation-delay:240ms]">
            <Link href="/register">
              <Button size="lg">
                Become an Agent
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/services">
              <Button size="lg" variant="outline">
                Explore services
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-600 animate-fade-up [animation-delay:320ms]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>RBI-licensed payment partners</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </span>
              <span>4.8 rated by 50,000+ retailers</span>
            </div>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4 animate-fade-up [animation-delay:400ms]">
            {heroStats.map((s) => (
              <div key={s.label}>
                <dt className="font-display text-3xl font-bold text-ink-900 md:text-4xl">
                  {s.value}
                </dt>
                <dd className="mt-1 text-xs uppercase tracking-wider text-ink-500">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-5">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-brand-300/40 via-brand-100/40 to-accent-200/40 blur-2xl" />

      <div className="relative rounded-[28px] border border-white/40 bg-white/80 p-5 shadow-glow backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-500">
              NextGenPay Wallet
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-ink-900">
              ₹ 28,450.00
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "AePS", color: "from-brand-500 to-brand-600" },
            { label: "DMT", color: "from-accent-500 to-accent-600" },
            { label: "Recharge", color: "from-emerald-500 to-emerald-600" }
          ].map((t) => (
            <div
              key={t.label}
              className={`rounded-2xl bg-gradient-to-br ${t.color} p-3 text-white shadow-soft`}
            >
              <p className="text-[10px] uppercase tracking-widest opacity-80">
                Today
              </p>
              <p className="mt-1 text-base font-bold">
                ₹{(Math.random() * 5000 + 1000).toFixed(0)}
              </p>
              <p className="text-[11px] opacity-90">{t.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {[
            { svc: "Mobile Recharge - Jio", amt: "₹ 299", time: "2m ago" },
            {
              svc: "Electricity - BSES",
              amt: "₹ 1,840",
              time: "12m ago"
            },
            { svc: "Money Transfer", amt: "₹ 5,000", time: "1h ago" }
          ].map((tx) => (
            <div
              key={tx.svc}
              className="flex items-center justify-between rounded-xl border border-ink-100 bg-white px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-ink-900">{tx.svc}</p>
                <p className="text-xs text-ink-500">{tx.time}</p>
              </div>
              <span className="text-sm font-semibold text-ink-900">
                {tx.amt}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl bg-gradient-to-r from-brand-50 to-accent-50 p-3 text-center text-xs text-ink-700">
          <span className="font-semibold text-brand-700">+₹2,184</span> earned
          today as commission
        </div>
      </div>

      <div className="absolute -left-6 top-10 hidden rounded-2xl border border-ink-100 bg-white px-3 py-2 shadow-soft md:block">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            ✓
          </span>
          <div>
            <p className="text-xs font-semibold text-ink-900">
              Transaction success
            </p>
            <p className="text-[10px] text-ink-500">2 seconds ago</p>
          </div>
        </div>
      </div>

      <div className="absolute -right-4 bottom-12 hidden rounded-2xl border border-ink-100 bg-white px-3 py-2 shadow-soft md:block">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-brand-700">
            ₹
          </span>
          <div>
            <p className="text-xs font-semibold text-ink-900">
              Wallet credited
            </p>
            <p className="text-[10px] text-ink-500">+₹ 2,500.00</p>
          </div>
        </div>
      </div>
    </div>
  );
}
