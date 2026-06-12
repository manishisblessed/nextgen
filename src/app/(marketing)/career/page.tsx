import type { Metadata } from "next";
import { ArrowRight, MapPin, Briefcase, Clock } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Career"
};

const openings = [
  {
    title: "Senior Backend Engineer (Payments)",
    team: "Engineering",
    location: "Bengaluru / Remote",
    type: "Full-time"
  },
  {
    title: "Product Designer (Retailer App)",
    team: "Design",
    location: "Delhi NCR",
    type: "Full-time"
  },
  {
    title: "Regional Sales Manager",
    team: "Sales",
    location: "Lucknow",
    type: "Full-time"
  },
  {
    title: "Customer Success Lead",
    team: "Operations",
    location: "Delhi NCR",
    type: "Full-time"
  },
  {
    title: "Compliance Manager (RBI)",
    team: "Compliance",
    location: "Mumbai",
    type: "Full-time"
  },
  {
    title: "Growth Marketing Intern",
    team: "Marketing",
    location: "Remote",
    type: "Internship"
  }
];

const perks = [
  "Competitive salary + ESOPs",
  "Health insurance for you & family",
  "Remote-first culture",
  "Annual offsite at exotic locations",
  "Generous parental leave",
  "Learning budget every quarter"
];

export default function CareerPage() {
  return (
    <>
      <PageHero
        eyebrow="Careers"
        title={<>Build the future of <span className="gradient-text">Bharat's banking</span></>}
        description="Join a team of doers, dreamers and builders making formal financial services accessible to every Indian. We're hiring across engineering, design, sales and ops."
      />

      <Section className="bg-white">
        <Container>
          <SectionHeading
            eyebrow="Why NextGenPay"
            title="Perks that actually matter"
            description="We invest in our people because building Bharat's fintech is a long, joyful marathon."
            align="left"
          />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {perks.map((perk) => (
              <div
                key={perk}
                className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-ink-50/40 px-5 py-4 text-sm font-medium text-ink-800"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  ✓
                </span>
                {perk}
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50/50">
        <Container>
          <SectionHeading
            eyebrow="Open roles"
            title="Find your next opportunity"
            align="left"
          />
          <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white">
            {openings.map((j, i) => (
              <div
                key={j.title}
                className="flex flex-col gap-4 border-b border-ink-100 p-6 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-display text-base font-semibold text-ink-900">
                    {j.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" /> {j.team}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {j.location}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {j.type}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Apply <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
