import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { services } from "@/lib/data";
import { cn } from "@/lib/utils";

const categoryStyles: Record<string, string> = {
  banking: "from-brand-500/10 to-brand-500/0 text-brand-700",
  recharge: "from-emerald-500/10 to-emerald-500/0 text-emerald-700",
  bills: "from-accent-500/10 to-accent-500/0 text-accent-700",
  travel: "from-violet-500/10 to-violet-500/0 text-violet-700",
  other: "from-ink-500/10 to-ink-500/0 text-ink-700"
};

export function ServicesGrid() {
  return (
    <Section className="bg-ink-50/50">
      <Container>
        <SectionHeading
          eyebrow="Banking & Digital Services"
          title="60+ services. One dashboard. Zero friction."
          description="Every banking & digital service your customers need — fully secured, RBI-compliant and ready to go live in minutes."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.slug}
                href={s.href}
                className="group relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
              >
                <div
                  className={cn(
                    "absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition group-hover:opacity-100",
                    categoryStyles[s.category]
                  )}
                />
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br",
                      categoryStyles[s.category]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {s.badge && (
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-700">
                      {s.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-ink-900">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm text-ink-500">{s.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 opacity-0 transition group-hover:opacity-100">
                  Open service <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Link href="/services">
            <Button variant="outline">
              View all services <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Container>
    </Section>
  );
}
