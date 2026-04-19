"use client";

import { useEffect, useRef, useState } from "react";

const items = [
  { value: 38, suffix: "M+", label: "Businesses onboarded" },
  { value: 184, suffix: " Cr", label: "Daily GMV processed" },
  { value: 99.97, suffix: "%", label: "Uptime SLA · 30 days" },
  { value: 1.4, suffix: "s", label: "Avg AePS settlement" },
  { value: 60, suffix: "+", label: "Live services" },
  { value: 28, suffix: "", label: "States · 9 languages" }
];

export function ImpactStats() {
  return (
    <section className="section relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-ink-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="conic-glow absolute -left-40 top-0 h-[420px] w-[420px] rounded-full opacity-30" />
        <div className="conic-glow absolute -right-40 bottom-0 h-[480px] w-[480px] rounded-full opacity-30" />
      </div>

      <div className="container-x relative">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
            Our impact, in numbers
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
            Powering Bharat&apos;s next{" "}
            <span className="bg-gradient-to-r from-accent-300 to-rose-300 bg-clip-text text-transparent">
              100 million
            </span>{" "}
            transactions.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Counter key={it.label} {...it} delay={i * 80} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Counter({
  value,
  suffix,
  label,
  delay
}: {
  value: number;
  suffix: string;
  label: string;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(0);

  useEffect(() => {
    let raf = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const start = performance.now();
            const dur = 1400;
            const tick = (t: number) => {
              const p = Math.min(1, (t - start) / dur);
              const ease = 1 - Math.pow(1 - p, 3);
              setV(value * ease);
              if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  const formatted = value >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(value < 10 ? 2 : 1);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="font-display text-5xl font-bold leading-none text-white">
        {formatted}
        <span className="text-3xl text-accent-300">{suffix}</span>
      </p>
      <p className="mt-3 text-sm uppercase tracking-widest text-white/70">{label}</p>
    </div>
  );
}
