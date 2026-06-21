"use client";

import {
  ShieldCheck,
  Zap,
  Layers,
  Globe2,
  type LucideIcon
} from "lucide-react";
import { Reveal, Stagger, StaggerItem, TiltCard } from "@/components/motion";
import { cn } from "@/lib/utils";

const pillars = [
  {
    icon: Zap,
    title: "Instant settlement",
    body: "T+0 commissions. T+1 nodal settlement. IMPS 24×7. UPI sub-second. Built on direct integrations with NPCI, NETC, BBPS.",
    color: "from-brand-500 to-violet-600"
  },
  {
    icon: ShieldCheck,
    title: "Bank-grade security",
    body: "ISO 27001 + PCI-DSS L1 + SOC 2 Type II. mTLS-only APIs. End-to-end encryption. WORM-archived audit logs.",
    color: "from-emerald-500 to-brand-600"
  },
  {
    icon: Layers,
    title: "Composable platform",
    body: "60+ services as REST APIs. Webhook-everything. Plug into your ERP, POS, neobank, or super-app in days, not months.",
    color: "from-accent-500 to-rose-500"
  },
  {
    icon: Globe2,
    title: "Pan-India, Bharat-first",
    body: "Live in 28 states · 9 languages · 1,200+ billers · 38M businesses onboarded across tier-1 to tier-6 towns.",
    color: "from-amber-500 to-accent-600"
  }
];

export function PlatformPillars() {
  return (
    <section className="section bg-ink-950 text-white">
      <div className="container-x">
        <Reveal>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80">
              <Zap className="h-3.5 w-3.5" /> The NextGenPay difference
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
              Built like a bank. <br />
              <span className="bg-gradient-to-r from-brand-300 via-violet-300 to-accent-400 bg-clip-text text-transparent">
                Felt like an app.
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/70">
              Four engineering pillars that quietly power every transaction across the network.
            </p>
          </div>
        </Reveal>

        <Stagger
          stagger={0.08}
          className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4"
        >
          {pillars.map((p) => (
            <StaggerItem key={p.title}>
              <PillarCard {...p} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function PillarCard({
  icon: Icon,
  title,
  body,
  color
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  color: string;
}) {
  return (
    <TiltCard
      intensity="subtle"
      glare={false}
      className="group relative h-full perspective-1200"
    >
      <div className="relative h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-colors duration-300 hover:bg-white/[0.07] preserve-3d">
        <div
          className={cn(
            "pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-30",
            color
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-glow transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3",
            color
          )}
          style={{ transform: "translateZ(40px)" }}
        >
          <Icon className="h-6 w-6" />
        </span>
        <h3
          className="mt-5 font-display text-lg font-semibold"
          style={{ transform: "translateZ(30px)" }}
        >
          {title}
        </h3>
        <p
          className="mt-2 text-sm leading-relaxed text-white/70"
          style={{ transform: "translateZ(20px)" }}
        >
          {body}
        </p>
      </div>
    </TiltCard>
  );
}
