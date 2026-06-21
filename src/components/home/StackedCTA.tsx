"use client";

import Link from "next/link";
import { ArrowRight, Phone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { company } from "@/lib/data";

export function StackedCTA() {
  return (
    <section className="section">
      <div className="container-x">
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-ink-950 via-brand-900 to-brand-700 p-10 text-white md:p-16">
            <div className="pointer-events-none absolute inset-0">
              <div className="conic-glow absolute -left-32 top-0 h-[400px] w-[400px] rounded-full animate-float-slow" />
              <div className="conic-glow absolute -right-24 bottom-0 h-[460px] w-[460px] rounded-full animate-float-slow [animation-delay:3s]" />
              <div className="absolute inset-0 grid-bg opacity-20 mask-fade-y" />
            </div>

            <div className="relative grid items-center gap-10 lg:grid-cols-2">
              <Reveal direction="up" delay={0.1}>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
                  <Sparkles className="h-3.5 w-3.5" />
                  Get started today
                </span>
                <h2 className="mt-5 font-display text-3xl font-bold leading-tight md:text-5xl">
                  Build the next great fintech business — <br />
                  <span className="bg-gradient-to-r from-accent-300 to-rose-300 bg-clip-text text-transparent">
                    on NextGenPay rails.
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
                    <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                      <Phone className="h-4 w-4" />
                      Talk to sales · +91 {company.phone}
                    </Button>
                  </a>
                </div>
              </Reveal>

              <Stagger stagger={0.08} className="grid gap-3 sm:grid-cols-2">
                {[
                  { l: "Onboard in", v: "5 min" },
                  { l: "Settlement", v: "T+0 / T+1" },
                  { l: "Setup fee", v: "₹ 0" },
                  { l: "Languages", v: "9" }
                ].map((s) => (
                  <StaggerItem key={s.l}>
                    <div className="group relative h-full overflow-hidden rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/10">
                      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br from-brand-300/40 to-accent-300/40 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                        {s.l}
                      </p>
                      <p className="mt-1 font-display text-3xl font-bold transition-transform duration-500 origin-left group-hover:scale-110">
                        {s.v}
                      </p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
