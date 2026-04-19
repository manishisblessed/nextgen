import Link from "next/link";
import { Check } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { pricingPlans } from "@/lib/data";
import { cn } from "@/lib/utils";

export function Pricing() {
  return (
    <Section className="bg-ink-50/50">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title="Economical pricing for every retailer"
          description="Pick a plan that fits your business — upgrade as you grow. Cancel anytime, no questions asked."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-8 shadow-sm transition",
                plan.highlighted
                  ? "border-brand-300 shadow-glow ring-1 ring-brand-200"
                  : "border-ink-100 hover:shadow-soft"
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600 to-accent-500 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <div>
                <p className="font-display text-lg font-semibold text-ink-900">
                  {plan.name}
                </p>
                <p className="mt-1 text-sm text-ink-500">{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold text-ink-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-ink-500">{plan.cadence}</span>
                </div>
              </div>

              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-ink-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Link href="/register">
                  <Button
                    variant={plan.highlighted ? "primary" : "outline"}
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
