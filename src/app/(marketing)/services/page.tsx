import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { PageHero } from "@/components/PageHero";
import { services } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Services"
};

const categories = [
  { id: "banking", label: "Banking" },
  { id: "recharge", label: "Recharges" },
  { id: "bills", label: "Bill Payments" },
  { id: "travel", label: "Travel" }
];

const colors: Record<string, string> = {
  banking: "bg-brand-50 text-brand-700",
  recharge: "bg-emerald-50 text-emerald-700",
  bills: "bg-accent-50 text-accent-700",
  travel: "bg-violet-50 text-violet-700",
  other: "bg-ink-50 text-ink-700"
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title={<>Everything your customers need, <span className="gradient-text">in one place</span></>}
        description="Banking, recharges, bills, travel — Payprism packs 60+ services into a single dashboard with real-time settlement and the best commissions in the industry."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
      />

      <Section className="bg-white">
        <Container>
          {categories.map((cat) => {
            const items = services.filter((s) => s.category === cat.id);
            if (!items.length) return null;
            return (
              <div key={cat.id} id={cat.id} className="mb-14">
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <h2 className="heading-md">{cat.label}</h2>
                    <p className="mt-1 text-sm text-ink-500">
                      {items.length} service{items.length > 1 ? "s" : ""} in this category
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((s) => {
                    const Icon = s.icon;
                    return (
                      <Link
                        key={s.slug}
                        id={s.slug}
                        href={s.href}
                        className="group flex items-start gap-4 rounded-2xl border border-ink-100 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
                      >
                        <span
                          className={cn(
                            "grid h-12 w-12 shrink-0 place-items-center rounded-xl",
                            colors[s.category]
                          )}
                        >
                          <Icon className="h-6 w-6" />
                        </span>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-display text-base font-semibold text-ink-900">
                              {s.title}
                            </h3>
                            {s.badge && (
                              <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                                {s.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-ink-500">
                            {s.description}
                          </p>
                          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                            Open service <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Container>
      </Section>
    </>
  );
}
