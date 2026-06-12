import Link from "next/link";
import { Landmark, ShieldCheck, ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { certifications } from "@/lib/data";

export function Compliance() {
  return (
    <Section className="relative overflow-hidden bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-bg opacity-[0.06]" />
        <div className="conic-glow absolute -left-32 top-0 h-[420px] w-[420px] rounded-full opacity-30" />
        <div className="conic-glow absolute -right-32 bottom-0 h-[480px] w-[480px] rounded-full opacity-30" />
      </div>

      <Container className="relative">
        <div className="grid items-end gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
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
          </div>

          <div className="lg:col-span-4 lg:text-right">
            <Link
              href="/legal/privacy"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              Read our DPDP commitment
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {certifications.map((c) => (
            <article
              key={c.code}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white font-display text-sm font-bold">
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
          ))}
        </div>

        {/* Compliance bullets */}
        <div className="mt-12 grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:grid-cols-3">
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
        </div>
      </Container>
    </Section>
  );
}

function ComplianceLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div>
        <p className="font-display text-sm font-semibold text-white">{title}</p>
        <p className="text-sm text-white/65">{body}</p>
      </div>
    </div>
  );
}
