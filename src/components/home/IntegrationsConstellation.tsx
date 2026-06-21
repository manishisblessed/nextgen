"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { integrations } from "@/lib/data";
import { cn } from "@/lib/utils";

export function IntegrationsConstellation() {
  return (
    <section className="section relative overflow-hidden">
      <div className="container-x">
        <Reveal>
          <div className="text-center">
            <span className="eyebrow">Powered together</span>
            <h2 className="heading-lg mt-4">
              One handshake. <span className="gradient-text">Every rail in India.</span>
            </h2>
            <p className="lead mx-auto mt-3 max-w-2xl">
              Direct integrations with NPCI, BBPS, RBI sandbox, nodal banks and biometric vendors. You ship —
              we handle the wires.
            </p>
          </div>
        </Reveal>

        <Stagger
          stagger={0.05}
          className="relative mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        >
          {integrations.map((p) => (
            <StaggerItem key={p.name}>
              <div className="group relative flex h-full flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-soft">
                <span
                  className={cn(
                    "grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br text-white shadow-soft transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6",
                    p.color
                  )}
                >
                  <span className="font-display text-xs font-bold tracking-wider">{p.initials}</span>
                </span>
                <p className="mt-3 text-center font-display text-sm font-semibold text-ink-900">
                  {p.name}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-ink-400">{p.category}</p>
                <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-brand-300/0 transition-all duration-300 group-hover:ring-brand-300/30" />
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal
          direction="up"
          delay={0.1}
          className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-ink-600"
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 font-semibold">
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring" />
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            99.97% uptime
          </span>
          <span>·</span>
          <span>1,238 live billers</span>
          <span>·</span>
          <span>12 service categories</span>
          <span>·</span>
          <span>9 Indian languages</span>
        </Reveal>
      </div>
    </section>
  );
}
