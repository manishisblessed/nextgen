import { PieChart, Zap, Award } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";

const goals = [
  {
    icon: PieChart,
    title: "Market Share",
    text: "Tap into the fast-growing utility fintech market — energy, water, telecom and more — with our complete BBPS-integrated stack."
  },
  {
    icon: Zap,
    title: "Easy Payment",
    text: "From UPI Collect to Aadhaar-Pay, accept payments the way your customers want and settle in real-time to your bank."
  },
  {
    icon: Award,
    title: "Awesome Services",
    text: "60+ services that change the game and make money management smarter, faster and far more convenient."
  }
];

export function Goals() {
  return (
    <Section className="bg-white">
      <Container>
        <SectionHeading
          eyebrow="Why Payprism"
          title="Financial goals are our priority"
          description="We help retailers grow their business and customers achieve their financial goals through utility fintech that just works."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {goals.map((g) => {
            const Icon = g.icon;
            return (
              <div
                key={g.title}
                className="group relative overflow-hidden rounded-3xl border border-ink-100 bg-white p-8 shadow-sm transition hover:shadow-soft"
              >
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-brand-100 to-accent-100 opacity-60 blur-2xl transition group-hover:opacity-100" />
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-glow">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-6 font-display text-xl font-semibold text-ink-900">
                  {g.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {g.text}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
