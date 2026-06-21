"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { indiaMissions } from "@/lib/data";

export function MadeInIndia() {
  return (
    <Section className="relative overflow-hidden bg-white">
      {/* Tricolour accent backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-[#FF9933]/10 blur-3xl animate-float-slow" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/0 blur-3xl" />
        <div className="absolute -right-32 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-[#138808]/10 blur-3xl animate-float-slow [animation-delay:2s]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink-100 to-transparent" />
      </div>

      <Container>
        <div className="grid items-end gap-10 lg:grid-cols-12 lg:gap-8">
          <Reveal direction="up" className="lg:col-span-7">
            <span className="eyebrow mb-4">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#FF9933]" />
              <span className="inline-flex h-2 w-2 rounded-full bg-white ring-1 ring-ink-200" />
              <span className="inline-flex h-2 w-2 rounded-full bg-[#138808]" />
              Made in Bharat. Made for Bharat.
            </span>
            <h2 className="heading-lg mt-3">
              Built on the rails of{" "}
              <span className="gradient-text">India&apos;s public digital infrastructure</span>{" "}
              — UPI, Aadhaar, BBPS &amp; ONDC.
            </h2>
            <p className="lead mt-5 max-w-2xl">
              NextGenPay is a 100% Indian fintech stack — engineered in Surat,
              hosted on Indian soil, and certified by every domestic regulator
              that matters. Every line of code is aligned with national missions
              that move Bharat from cash to digital.
            </p>
          </Reveal>

          <Reveal direction="up" delay={0.1} className="lg:col-span-5">
            <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
              <Link href="/about">
                <Button variant="outline">
                  Read our India story <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/register">
                <Button>
                  Become an Agent
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>

        <Stagger
          stagger={0.1}
          className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4"
        >
          {indiaMissions.map((m) => (
            <StaggerItem key={m.code}>
              <article className="group relative h-full overflow-hidden rounded-3xl border border-ink-100 bg-white p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-soft">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-brand-100 via-white to-accent-100 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-brand-700">
                    {m.code}
                  </span>
                  <span className="inline-flex h-7 items-center gap-1 rounded-full bg-ink-50 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-600 transition-colors duration-300 group-hover:bg-brand-50 group-hover:text-brand-700">
                    Mission · Bharat
                  </span>
                </div>

                <h3 className="mt-5 font-display text-lg font-semibold text-ink-900">
                  {m.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {m.body}
                </p>

                <div className="mt-6 flex items-baseline gap-2 border-t border-ink-100 pt-4">
                  <span className="font-display text-2xl font-bold text-ink-900 transition-transform duration-300 group-hover:scale-105 origin-left">
                    {m.stat}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-ink-500">
                    {m.statLabel}
                  </span>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Tricolour band */}
        <Reveal direction="up" delay={0.1} className="mt-12">
          <div className="overflow-hidden rounded-2xl ring-1 ring-ink-100">
            <div className="grid grid-cols-3 text-center text-xs font-semibold uppercase tracking-widest text-white">
              <div className="bg-[#FF9933] py-3">
                Onboarded in 28 States &amp; 8 UTs
              </div>
              <div className="bg-white py-3 text-ink-700 ring-1 ring-ink-100">
                9 Indian Languages
              </div>
              <div className="bg-[#138808] py-3">
                ₹0 Subsidy · ₹0 Foreign Capital
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
