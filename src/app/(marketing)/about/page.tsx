import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { PageHero } from "@/components/PageHero";
import { Target, Eye, HeartHandshake, Trophy } from "lucide-react";

export const metadata: Metadata = {
  title: "About"
};

const values = [
  {
    icon: Target,
    title: "Our Mission",
    text: "Bring formal banking and digital services within reach of every Indian — last-mile, first-class."
  },
  {
    icon: Eye,
    title: "Our Vision",
    text: "Become the most trusted utility-fintech network powering Bharat's next billion transactions."
  },
  {
    icon: HeartHandshake,
    title: "Our Values",
    text: "Customer-obsession, transparency, ownership and respect for the retailer who serves Bharat."
  },
  {
    icon: Trophy,
    title: "Our Promise",
    text: "Zero hidden fees, instant settlement and human support — every single transaction, every single day."
  }
];

const milestones = [
  {
    year: "2022",
    text: "Payprism Technology Pvt. Ltd. incorporated in Delhi (CIN U74990DL2022PTC407681)."
  },
  { year: "2023", text: "Launched AePS, DMT & BBPS for our first 5,000 retailers." },
  { year: "2024", text: "Crossed 50,000 active agents across North India." },
  {
    year: "2025",
    text: "Expanded into travel — flights, hotels & bus bookings."
  },
  { year: "2026", text: "Building India-wide distributor network from Bhagirath Palace." }
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title={<>Building a smarter Bharat, <span className="gradient-text">one transaction at a time</span></>}
        description="Payprism (operated by Payprism Technology Pvt. Ltd., CIN U74990DL2022PTC407681) is a digital banking & utility fintech platform on a mission to simplify financial services for every Indian. From village kiranas to urban distributors, our retailers serve millions of customers every day."
      />

      <Section className="bg-white">
        <Container>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="card-base">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-semibold text-ink-900">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink-600">{v.text}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50/50">
        <Container>
          <div className="mb-12 max-w-2xl">
            <span className="eyebrow">Our journey</span>
            <h2 className="heading-lg mt-4">From a Chandni Chowk office to India's trusted fintech partner</h2>
          </div>
          <div className="relative space-y-8 border-l-2 border-brand-100 pl-8">
            {milestones.map((m) => (
              <div key={m.year} className="relative">
                <span className="absolute -left-[42px] top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-brand-500 bg-white text-[10px] font-bold text-brand-700">
                  ●
                </span>
                <p className="font-display text-xl font-bold text-ink-900">
                  {m.year}
                </p>
                <p className="mt-1 text-sm text-ink-600">{m.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
