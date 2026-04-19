"use client";

import { integrations } from "@/lib/data";
import { cn } from "@/lib/utils";

export function IntegrationsConstellation() {
  return (
    <section className="section relative overflow-hidden">
      <div className="container-x">
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

        <div className="relative mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {integrations.map((p, i) => (
            <div
              key={p.name}
              className="group relative flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white p-5 transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-soft"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span
                className={cn(
                  "grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br text-white shadow-soft",
                  p.color
                )}
              >
                <span className="font-display text-xs font-bold tracking-wider">{p.initials}</span>
              </span>
              <p className="mt-3 text-center font-display text-sm font-semibold text-ink-900">
                {p.name}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-ink-400">{p.category}</p>
              <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-brand-300/0 transition group-hover:ring-brand-300/30" />
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-ink-600">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 font-semibold">
            ● 99.97% uptime
          </span>
          <span>·</span>
          <span>1,238 live billers</span>
          <span>·</span>
          <span>12 service categories</span>
          <span>·</span>
          <span>9 Indian languages</span>
        </div>
      </div>
    </section>
  );
}
