"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { faqs } from "@/lib/data";
import { cn } from "@/lib/utils";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section className="bg-ink-50/50">
      <Container>
        <SectionHeading
          eyebrow="Frequently asked questions"
          title="Everything you need to know"
          description="Can't find your answer? Our support team replies in under 15 minutes on WhatsApp."
        />

        <div className="mx-auto max-w-3xl divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-100 bg-white">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-ink-50"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-semibold text-ink-900">
                    {f.q}
                  </span>
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full transition",
                      isOpen
                        ? "bg-brand-600 text-white"
                        : "bg-ink-100 text-ink-700"
                    )}
                  >
                    {isOpen ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm leading-relaxed text-ink-600">
                      {f.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
