import Link from "next/link";
import { ArrowRight, Calendar, Eye } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import { blogPosts } from "@/lib/data";

export function Blog() {
  return (
    <Section className="bg-white">
      <Container>
        <SectionHeading
          eyebrow="News & insights"
          title="Latest from Payprism"
          description="Tips, trends and product updates to help your business grow faster."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {blogPosts.map((p) => (
            <article
              key={p.slug}
              className="group flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition hover:shadow-soft"
            >
              <div className="relative h-44 overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100">
                <div className="absolute inset-0 bg-grid-pattern opacity-40" />
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                  {p.category}
                </span>
                <div className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-gradient-to-br from-brand-400 to-accent-400 opacity-30 blur-2xl" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-lg font-semibold text-ink-900 transition group-hover:text-brand-700">
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
                  className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700"
                >
                  Read more <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
