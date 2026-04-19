"use client";

import { useEffect, useState } from "react";
import { Star, Quote } from "lucide-react";
import { testimonials } from "@/lib/data";
import { cn } from "@/lib/utils";

export function AnimatedTestimonials() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((a) => (a + 1) % testimonials.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const t = testimonials[active];

  return (
    <section className="section bg-ink-50/40">
      <div className="container-x">
        <div className="text-center">
          <span className="eyebrow">Loved across India</span>
          <h2 className="heading-lg mt-4">
            <span className="gradient-text">38 million businesses</span> can&apos;t be wrong.
          </h2>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-10 text-white shadow-glow">
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <Quote className="h-10 w-10 text-white/30" />
            <blockquote
              key={t.name}
              className="mt-4 animate-fade-up font-display text-xl leading-relaxed md:text-2xl"
            >
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <div className="mt-8 flex items-center justify-between">
              <div>
                <p className="font-display text-base font-semibold">{t.name}</p>
                <p className="text-sm text-white/80">{t.role}</p>
              </div>
              <div className="flex">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-300 text-amber-300" />
                ))}
              </div>
            </div>

            <div className="mt-6 flex gap-1.5">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === active ? "w-8 bg-white" : "w-3 bg-white/30 hover:bg-white/60"
                  )}
                  aria-label={`Show testimonial ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {testimonials.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
                  i === active
                    ? "border-brand-500 bg-white shadow-soft"
                    : "border-ink-100 bg-white/60 hover:border-brand-300 hover:bg-white"
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-display text-sm font-bold text-white">
                  {t.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{t.name}</p>
                  <p className="truncate text-xs text-ink-500">{t.role}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
