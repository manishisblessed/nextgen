"use client";

import { MapPin, Languages, Building2, Users } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { coverageZones, languagesSupported } from "@/lib/data";

const headline = [
  { icon: MapPin, value: "28", label: "States · 8 UTs" },
  { icon: Building2, value: "19,400+", label: "PIN codes served" },
  { icon: Users, value: "35.2 L", label: "Active retailers" },
  { icon: Languages, value: "9", label: "Indian languages" }
];

export function Coverage() {
  return (
    <Section className="bg-ink-50/50">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <Reveal direction="left" className="lg:col-span-5">
            <span className="eyebrow mb-4">
              <MapPin className="h-3.5 w-3.5" />
              From Kanyakumari to Kashmir
            </span>
            <h2 className="heading-lg mt-3">
              A Bharat-wide network that <br className="hidden md:block" />
              <span className="gradient-text">speaks your customer&apos;s language.</span>
            </h2>
            <p className="lead mt-5">
              35 lakh+ kirana shops, CSPs and distributors in 19,400+ PIN codes
              already power their daily ledger on NextGenPay. The app, dashboard
              and support team operate in nine Indian languages so no retailer
              is left behind.
            </p>

            <Stagger stagger={0.08} className="mt-10 grid grid-cols-2 gap-5">
              {headline.map((h) => {
                const Icon = h.icon;
                return (
                  <StaggerItem key={h.label}>
                    <dl className="group h-full rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-soft">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3">
                        <Icon className="h-5 w-5" />
                      </span>
                      <dt className="mt-4 font-display text-2xl font-bold text-ink-900">
                        {h.value}
                      </dt>
                      <dd className="text-xs uppercase tracking-widest text-ink-500">
                        {h.label}
                      </dd>
                    </dl>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </Reveal>

          <Reveal direction="right" delay={0.1} className="lg:col-span-7">
            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft md:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                Coverage by zone · Q1 FY26
              </p>

              <Stagger stagger={0.07} className="mt-5 divide-y divide-ink-100">
                {coverageZones.map((z) => (
                  <StaggerItem key={z.zone}>
                    <ZoneRow {...z} />
                  </StaggerItem>
                ))}
              </Stagger>

              <Reveal
                direction="up"
                delay={0.2}
                className="mt-7 rounded-2xl bg-gradient-to-r from-brand-50 via-white to-accent-50 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                  Available in
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {languagesSupported.map((lng) => (
                    <span
                      key={lng}
                      className="inline-flex items-center rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 hover:shadow-soft"
                    >
                      {lng}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

function ZoneRow({
  zone,
  states,
  retailers,
  topCities
}: {
  zone: string;
  states: number;
  retailers: string;
  topCities: string[];
}) {
  return (
    <div className="group grid grid-cols-12 items-center gap-3 py-4 transition-colors duration-300 hover:bg-brand-50/40 rounded-xl px-2 -mx-2">
      <div className="col-span-5 sm:col-span-3">
        <p className="font-display text-base font-semibold text-ink-900">
          {zone} India
        </p>
        <p className="text-xs text-ink-500">{states} states · live</p>
      </div>
      <div className="col-span-7 sm:col-span-3">
        <p className="font-display text-xl font-bold text-brand-700 transition-transform duration-300 origin-left group-hover:scale-110">
          {retailers}
        </p>
        <p className="text-[11px] uppercase tracking-widest text-ink-500">
          Active retailers
        </p>
      </div>
      <div className="col-span-12 sm:col-span-6">
        <div className="flex flex-wrap gap-1.5">
          {topCities.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors duration-300 hover:bg-brand-100 hover:text-brand-700"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
