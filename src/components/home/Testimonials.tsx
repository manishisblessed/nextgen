import { Star, Quote } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { testimonials } from "@/lib/data";

export function Testimonials() {
  return (
    <Section className="bg-white">
      <Container>
        <SectionHeading
          eyebrow="Trusted by professionals"
          title="Loved by retailers across India"
          description="Real stories from agents and distributors who grew their business with NextGenPay."
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="relative flex flex-col rounded-3xl border border-ink-100 bg-gradient-to-br from-white to-ink-50/40 p-6 shadow-sm transition hover:shadow-soft"
            >
              <Quote className="absolute right-5 top-5 h-7 w-7 text-brand-100" />
              <div className="flex items-center gap-1 text-amber-500">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-700">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-4">
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-display text-sm font-bold text-white"
                >
                  {t.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {t.name}
                  </p>
                  <p className="text-xs text-ink-500">{t.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </Section>
  );
}
