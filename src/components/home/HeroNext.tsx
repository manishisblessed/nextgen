"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Wallet,
  Fingerprint,
  Send,
  QrCode,
  Smartphone,
  Receipt,
  Plane,
  TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { heroStats } from "@/lib/data";
import { cn } from "@/lib/utils";

export function HeroNext() {
  return (
    <section className="relative overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-bg mask-fade-y opacity-50" />
        <div className="conic-glow absolute -left-40 top-10 h-[420px] w-[420px] rounded-full" />
        <div className="conic-glow absolute -right-40 top-40 h-[480px] w-[480px] rounded-full" />
        <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-white/40 to-transparent" />
      </div>

      <div className="container-x grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <span className="eyebrow animate-fade-up">
            <Sparkles className="h-3.5 w-3.5" />
            India&apos;s most loved fintech OS
          </span>

          <h1 className="heading-xl mt-5 animate-fade-up [animation-delay:80ms]">
            One platform for{" "}
            <span className="relative inline-block">
              <span className="gradient-text bg-[length:200%_auto] animate-gradient-x">
                every shop
              </span>
              <svg
                viewBox="0 0 220 12"
                className="absolute -bottom-2 left-0 h-3 w-full text-accent-400"
                fill="none"
              >
                <path
                  d="M2 6 Q 60 0, 110 6 T 218 6"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            ,<br />
            every distributor, every bank.
          </h1>

          <p className="lead mt-6 max-w-2xl animate-fade-up [animation-delay:160ms]">
            NextGenPay is the operating system for India&apos;s digital banking economy. 60+ services,
            4 personas, real-time settlements, 99.97% uptime — built for the next 100 million retailers.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up [animation-delay:240ms]">
            <Link href="/register">
              <Button size="lg">
                Start free — onboard in 5 min
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#tour">
              <Button size="lg" variant="outline">
                Watch product tour
              </Button>
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-600 animate-fade-up [animation-delay:320ms]">
            <Trusty icon={ShieldCheck} text="RBI-licensed nodal banks" />
            <Trusty icon={ShieldCheck} text="ISO 27001 + PCI-DSS L1" />
            <Trusty icon={ShieldCheck} text="SOC 2 Type II" />
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4 animate-fade-up [animation-delay:400ms]">
            {heroStats.map((s) => (
              <Counter key={s.label} value={s.value} label={s.label} />
            ))}
          </dl>
        </div>

        <div className="lg:col-span-5">
          <Hero3DCard />
        </div>
      </div>
    </section>
  );
}

function Trusty({ icon: Icon, text }: { icon: typeof ShieldCheck; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-emerald-600" />
      <span>{text}</span>
    </div>
  );
}

function Counter({ value, label }: { value: string; label: string }) {
  // animate the numeric portion in
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const num = parseFloat(value.replace(/[^\d.]/g, ""));
    if (!num || Number.isNaN(num)) return setDisplay(value);
    const suffix = value.replace(/[\d.,]/g, "");
    let start: number | null = null;
    const duration = 1200;
    let raf = 0;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = (num * eased).toFixed(num >= 100 ? 0 : 1);
      setDisplay(v + suffix);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div ref={ref}>
      <dt className="font-display text-3xl font-bold text-ink-900 md:text-4xl text-glow">
        {display}
      </dt>
      <dd className="mt-1 text-xs uppercase tracking-wider text-ink-500">
        {label}
      </dd>
    </div>
  );
}

function Hero3DCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0 });

  function handleMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    setT({ x: dx, y: dy });
  }
  function handleLeave() {
    setT({ x: 0, y: 0 });
  }

  return (
    <div className="relative mx-auto w-full max-w-md perspective-1200">
      <div className="absolute -inset-10 -z-10 rounded-[44px] bg-gradient-to-br from-brand-300/40 via-violet-200/40 to-accent-300/40 blur-3xl" />

      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="relative preserve-3d"
        style={{
          transform: `rotateY(${-t.x * 14}deg) rotateX(${t.y * 14}deg)`,
          transition: "transform 0.18s ease-out"
        }}
      >
        <div
          className="relative rounded-[28px] border border-white/60 bg-white/85 p-5 shadow-glow backdrop-blur"
          style={{ transform: "translateZ(40px)" }}
        >
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
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Active
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "AePS", color: "from-brand-500 to-brand-700", val: "₹3,420" },
              { label: "DMT", color: "from-accent-500 to-accent-700", val: "₹1,840" },
              { label: "Recharge", color: "from-emerald-500 to-emerald-700", val: "₹2,180" }
            ].map((t, i) => (
              <div
                key={t.label}
                className={cn(
                  "rounded-2xl bg-gradient-to-br p-3 text-white shadow-soft",
                  t.color
                )}
                style={{ transform: `translateZ(${20 + i * 6}px)` }}
              >
                <p className="text-[10px] uppercase tracking-widest opacity-80">Today</p>
                <p className="mt-1 text-base font-bold">{t.val}</p>
                <p className="text-[11px] opacity-90">{t.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {[Fingerprint, Send, QrCode, Smartphone, Receipt, Plane, Wallet, TrendingUp].map((I, i) => (
              <span
                key={i}
                className="grid h-12 w-full place-items-center rounded-xl bg-ink-50 text-ink-700 transition hover:bg-brand-600 hover:text-white"
                style={{ transform: `translateZ(${10}px)` }}
              >
                <I className="h-4 w-4" />
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-500 p-3 text-center text-xs text-white shadow-soft">
            <span className="font-semibold">+₹ 2,184</span> earned today as commission
          </div>
        </div>

        {/* Floating badges */}
        <div
          className="absolute -left-10 top-16 hidden rounded-2xl border border-white/70 bg-white px-3 py-2 shadow-soft md:block animate-float"
          style={{ transform: "translateZ(80px)" }}
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
            <div>
              <p className="text-xs font-semibold text-ink-900">AePS · ₹2,000</p>
              <p className="text-[10px] text-ink-500">Settled in 1.4s</p>
            </div>
          </div>
        </div>

        <div
          className="absolute -right-6 bottom-20 hidden rounded-2xl border border-white/70 bg-white px-3 py-2 shadow-soft md:block animate-float [animation-delay:1.2s]"
          style={{ transform: "translateZ(70px)" }}
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-brand-700">₹</span>
            <div>
              <p className="text-xs font-semibold text-ink-900">Wallet credited</p>
              <p className="text-[10px] text-ink-500">+₹ 2,500.00</p>
            </div>
          </div>
        </div>

        <div
          className="absolute -left-4 -bottom-4 hidden rounded-2xl border border-white/70 bg-gradient-to-br from-brand-600 to-violet-600 px-3 py-2 text-white shadow-glow md:block animate-float [animation-delay:0.6s]"
          style={{ transform: "translateZ(90px)" }}
        >
          <p className="text-[10px] uppercase tracking-widest opacity-80">Today</p>
          <p className="font-display text-sm font-bold">74 transactions</p>
        </div>
      </div>
    </div>
  );
}
