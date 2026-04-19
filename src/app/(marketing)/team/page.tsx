import type { Metadata } from "next";
import { Linkedin } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Team"
};

const team = [
  {
    name: "Aman Sharma",
    role: "Co-founder & CEO",
    bio: "Ex-payments at a leading bank. Building Bharat's most loved fintech."
  },
  {
    name: "Anjali Iyer",
    role: "Co-founder & COO",
    bio: "10+ years in retail networks. Obsessed with retailer experience."
  },
  {
    name: "Rohan Mehta",
    role: "CTO",
    bio: "Distributed systems engineer. Loves building reliable rails."
  },
  {
    name: "Priya Nair",
    role: "VP Product",
    bio: "Designs delightful flows for first-time internet users."
  },
  {
    name: "Vikram Bose",
    role: "VP Engineering",
    bio: "Scaled multiple fintech platforms to billions of transactions."
  },
  {
    name: "Sneha Kapoor",
    role: "Head of Compliance",
    bio: "Former RBI auditor. Champion of safe & sound finance."
  },
  {
    name: "Karan Joshi",
    role: "Head of Sales",
    bio: "Built distributor networks across 22 states from the ground up."
  },
  {
    name: "Meera Krishnan",
    role: "Head of Design",
    bio: "Believes great design speaks every Indian language."
  }
];

export default function TeamPage() {
  return (
    <>
      <PageHero
        eyebrow="Team"
        title={<>The people behind <span className="gradient-text">Payprism</span></>}
        description="A small, mission-driven team obsessed with building world-class fintech for retailers and consumers across Bharat."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Team" }]}
      />

      <Section className="bg-white">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((m) => (
              <div
                key={m.name}
                className="group rounded-2xl border border-ink-100 bg-white p-6 text-center shadow-sm transition hover:shadow-soft"
              >
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-display text-xl font-bold text-white shadow-glow transition group-hover:scale-105">
                  {m.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-ink-900">
                  {m.name}
                </h3>
                <p className="text-xs uppercase tracking-widest text-brand-700">
                  {m.role}
                </p>
                <p className="mt-3 text-sm text-ink-600">{m.bio}</p>
                <a
                  href="#"
                  aria-label={`${m.name} LinkedIn`}
                  className="mt-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-ink-700 transition hover:bg-brand-600 hover:text-white"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
