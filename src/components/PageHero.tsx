import { Container } from "@/components/ui/Container";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHero({
  eyebrow,
  title,
  description,
  breadcrumbs
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white pb-12 pt-12 md:pb-16 md:pt-20">
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.06]" />
      <Container>
        {breadcrumbs && (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
              {breadcrumbs.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                  {b.href ? (
                    <Link href={b.href} className="hover:text-brand-700">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="text-ink-700">{b.label}</span>
                  )}
                  {i < breadcrumbs.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-ink-400" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="max-w-3xl">
          {eyebrow && <span className="eyebrow mb-4">{eyebrow}</span>}
          <h1 className="heading-xl mt-2">{title}</h1>
          {description && <p className="lead mt-5">{description}</p>}
        </div>
      </Container>
    </section>
  );
}
