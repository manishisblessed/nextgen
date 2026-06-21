"use client";

import Link from "next/link";
import { ArrowRight, Calendar, Eye } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { blogPosts } from "@/lib/data";

export function Blog() {
  return (
    <Section className="bg-white">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="News & insights"
            title="Latest from NextGenPay"
            description="Tips, trends and product updates to help your business grow faster."
          />
        </Reveal>

        <Stagger stagger={0.1} className="grid gap-6 lg:grid-cols-3">
          {blogPosts.map((p) => (
            <StaggerItem key={p.slug}>
              <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition-all duration-500 hover:-translate-y-2 hover:border-brand-200 hover:shadow-soft">
                <div className="relative h-44 overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100">
                  <div className="absolute inset-0 bg-grid-pattern opacity-40 transition-transform duration-700 group-hover:scale-110" />
                  <span className="absolute left-4 top-4 z-10 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700 shadow-sm transition-transform duration-300 group-hover:scale-105">
                    {p.category}
                  </span>
                  <div className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-gradient-to-br from-brand-400 to-accent-400 opacity-30 blur-2xl transition-all duration-700 group-hover:scale-150 group-hover:opacity-60" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-lg font-semibold text-ink-900 transition-colors duration-300 group-hover:text-brand-700">
                    {p.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">
                    {p.excerpt}
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" /> {p.date}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> {p.readTime}
                    </span>
                  </div>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 transition-all duration-300 [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:translate-x-1"
                  >
                    Read more <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}
