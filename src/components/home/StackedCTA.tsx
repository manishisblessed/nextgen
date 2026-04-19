"use client";

import Link from "next/link";
import { ArrowRight, Phone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { company } from "@/lib/data";

export function StackedCTA() {
  return (
    <section className="section">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-ink-950 via-brand-900 to-brand-700 p-10 text-white md:p-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="conic-glow absolute -left-32 top-0 h-[400px] w-[400px] rounded-full" />
            <div className="conic-glow absolute -right-24 bottom-0 h-[460px] w-[460px] rounded-full" />
            <div className="absolute inset-0 grid-bg opacity-20 mask-fade-y" />
          </div>

          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
                <Sparkles className="h-3.5 w-3.5" />
                Get started today
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold leading-tight md:text-5xl">
                Build the next great fintech business — <br />
                <span className="bg-gradient-to-r from-accent-300 to-rose-300 bg-clip-text text-transparent">
                  on Payprism rails.
                </span>
              </h2>
              <p className="mt-4 max-w-xl text-white/80">
                Free to start, free to scale. No setup fees, no hidden charges. Just login,
                onboard your first retailer in 5 minutes, and start earning.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register">
                  <Button size="lg" variant="accent">
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href={`tel:+91${company.phone}`}>
                  <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15">
                    <Phone className="h-4 w-4" />
                    Talk to sales · +91 {company.phone}
                  </Button>
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { l: "Onboard in", v: "5 min" },
                { l: "Settlement", v: "T+0 / T+1" },
                { l: "Setup fee", v: "₹ 0" },
                { l: "Languages", v: "9" }
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                    {s.l}
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
