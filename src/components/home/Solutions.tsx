import { Clock, BadgeCheck, Sparkles, Layers } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";

const solutions = [
  {
    icon: Clock,
    title: "Anytime Transactions",
    text: "24x7 settlement with instant IMPS transfers and no holiday delays."
  },
  {
    icon: BadgeCheck,
    title: "Zero Hidden Cost",
    text: "Transparent pricing — every fee is shown before you confirm."
  },
  {
    icon: Sparkles,
    title: "Replace Complexity with Simplicity",
    text: "One login, one wallet, one dashboard for every service you sell."
  },
  {
    icon: Layers,
    title: "Built for Scale",
    text: "From a single retailer to a 10,000-strong distributor network."
  }
];

export function Solutions() {
  return (
    <Section className="bg-white">
      <Container>
        <SectionHeading
          eyebrow="Exceptional services"
          title="Replacing complexity with simplicity"
          description="Great fintech takes everything frustrating about money — and makes it effortless. That's our north star."
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {solutions.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="group rounded-2xl border border-ink-100 bg-gradient-to-br from-white to-ink-50/40 p-6 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold text-ink-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {s.text}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
