"use client";

import Link from "next/link";
import { Landmark, ShieldCheck, ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { certifications } from "@/lib/data";

export function Compliance() {
  return (
    <Section className="relative overflow-hidden bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-bg opacity-[0.06]" />
        <div className="conic-glow absolute -left-32 top-0 h-[420px] w-[420px] rounded-full opacity-30 animate-float-slow" />
        <div className="conic-glow absolute -right-32 bottom-0 h-[480px] w-[480px] rounded-full opacity-30 animate-float-slow [animation-delay:3s]" />
      </div>

      <Container className="relative">
        <div className="grid items-end gap-10 lg:grid-cols-12">
          <Reveal direction="up" className="lg:col-span-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80">
              <Landmark className="h-3.5 w-3.5" /> Compliance &amp; Certifications
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
              Regulated. Audited.{" "}
              <span className="bg-gradient-to-r from-brand-300 via-violet-300 to-accent-300 bg-clip-text text-transparent">
                Indian by law.
              </span>
            </h2>
            <p className="mt-4 max-w-2xl text-white/70">
              Every rupee that moves through NextGenPay is settled through
              RBI-licensed sponsor banks, certified NPCI rails and ISO-grade
              security controls — and every byte stays inside Indian data
              centres as mandated by the RBI on Storage of Payment System Data,
              2018.
            </p>
          </Reveal>

          <Reveal direction="up" delay={0.1} className="lg:col-span-4 lg:text-right">
            <Link
              href="/legal/privacy"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-glow [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:translate-x-1"
            >
              Read our DPDP commitment
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <Stagger
          stagger={0.07}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {certifications.map((c) => (
            <StaggerItem key={c.code}>
              <article className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:border-white/30 hover:bg-white/[0.08] hover:shadow-glow">
                <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-brand-400/30 to-accent-400/30 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white font-display text-sm font-bold transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
                    {c.code}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    <ShieldCheck className="h-3 w-3" />
                    {c.status}
                  </span>
                </div>

                <h3 className="mt-5 font-display text-base font-semibold text-white">
                  {c.name}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-wider text-white/50">
                  {c.authority}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  {c.description}
                </p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Compliance bullets */}
        <Reveal
          direction="up"
          delay={0.1}
          className="mt-12 grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:grid-cols-3"
        >
          <ComplianceLine
            title="Data localisation"
            body="All payment-system data stored on Indian soil — RBI 2018 circular."
          />
          <ComplianceLine
            title="DPDP-aligned consent"
            body="Free, specific, informed, unambiguous consent for every data field."
          />
          <ComplianceLine
            title="CERT-In incident response"
            body="6-hour reporting protocol; annual VAPT by an empanelled auditor."
          />
        </Reveal>
      </Container>
    </Section>
  );
}

function ComplianceLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="group flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-300 transition-all duration-300 group-hover:scale-110 group-hover:bg-emerald-500/25">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div>
        <p className="font-display text-sm font-semibold text-white">{title}</p>
        <p className="text-sm text-white/65">{body}</p>
      </div>
    </div>
  );
}
