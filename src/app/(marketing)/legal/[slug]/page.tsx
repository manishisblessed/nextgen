import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ShieldCheck,
  CalendarDays,
  FileText,
  ScrollText,
  ArrowUpRight,
  Mail,
  Phone,
  MapPin,
  AlertCircle
} from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import {
  company,
  grievanceOfficer,
  legalDocuments,
  type LegalSection
} from "@/lib/data";

export function generateStaticParams() {
  return Object.keys(legalDocuments).map((slug) => ({ slug }));
}

export function generateMetadata({
  params
}: {
  params: { slug: string };
}): Metadata {
  const doc = legalDocuments[params.slug];
  if (!doc) return { title: "Legal" };
  return {
    title: `${doc.title} · ${company.brand}`,
    description: doc.description
  };
}

const otherDocs = Object.values(legalDocuments);

export default function LegalPage({
  params
}: {
  params: { slug: string };
}) {
  const doc = legalDocuments[params.slug];
  if (!doc) notFound();

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-ink-100 bg-gradient-to-b from-brand-50/70 via-white to-white">
        <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.06]" />
        <div className="absolute -left-32 top-0 -z-10 h-[420px] w-[420px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute -right-24 -top-20 -z-10 h-[360px] w-[360px] rounded-full bg-accent-200/40 blur-3xl" />

        <Container className="py-16 md:py-20">
          <div className="grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <span className="eyebrow mb-4">
                <ShieldCheck className="h-3.5 w-3.5" />
                {doc.eyebrow}
              </span>
              <h1 className="heading-xl mt-2">{doc.title}</h1>
              <p className="lead mt-5 max-w-3xl">{doc.description}</p>

              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-600">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-brand-600" />
                  Last updated · <strong>{doc.lastUpdated}</strong>
                </span>
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-600" />
                  {company.legalName}
                </span>
                <span className="inline-flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-brand-600" />
                  CIN · {company.cin}
                </span>
              </div>
            </div>

            <div className="lg:col-span-4">
              <div className="rounded-3xl border border-ink-100 bg-white/80 p-6 shadow-soft backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                  Governed by
                </p>
                <ul className="mt-3 space-y-2">
                  {doc.governedBy.map((law) => (
                    <li
                      key={law}
                      className="flex items-start gap-2 text-sm text-ink-700"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      {law}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* BODY */}
      <Section className="bg-white">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12">
            {/* Table of contents */}
            <aside className="lg:col-span-3">
              <div className="sticky top-24">
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                  On this page
                </p>
                <nav className="mt-4 space-y-2 border-l border-ink-100 pl-4">
                  {doc.sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block text-sm text-ink-600 transition hover:text-brand-700"
                    >
                      {s.heading}
                    </a>
                  ))}
                </nav>

                <div className="mt-8 rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-sm text-ink-700">
                  <p className="font-semibold text-ink-900">
                    Need a copy on your letterhead?
                  </p>
                  <p className="mt-1 text-ink-600">
                    Email{" "}
                    <a
                      href={`mailto:${company.legalEmail}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {company.legalEmail}
                    </a>{" "}
                    for a signed PDF copy.
                  </p>
                </div>
              </div>
            </aside>

            {/* Sections */}
            <article className="lg:col-span-9">
              <div className="space-y-12">
                {doc.sections.map((section) => (
                  <SectionRenderer key={section.id} section={section} />
                ))}

                {/* Always-on grievance officer card */}
                <div
                  id="grievance-officer"
                  className="rounded-3xl border border-ink-100 bg-ink-50/60 p-7 md:p-8"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                      <AlertCircle className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-ink-900">
                        Grievance Redressal Officer
                      </h3>
                      <p className="mt-1 text-sm text-ink-600">
                        As required under Rule 5(9) of the IT (Reasonable
                        Security Practices) Rules, 2011 and Rule 3(2) of the IT
                        (Intermediary Guidelines) Rules, 2021.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                        Officer
                      </p>
                      <p className="mt-1 font-medium text-ink-900">
                        {grievanceOfficer.name}
                      </p>
                      <p className="text-sm text-ink-600">
                        {grievanceOfficer.designation}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                        Service hours
                      </p>
                      <p className="mt-1 text-sm text-ink-700">
                        {grievanceOfficer.hours}
                      </p>
                    </div>
                    <div className="space-y-2 text-sm text-ink-700">
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-brand-600" />
                        <a
                          href={`mailto:${grievanceOfficer.email}`}
                          className="hover:underline"
                        >
                          {grievanceOfficer.email}
                        </a>
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-brand-600" />
                        {grievanceOfficer.phone}
                      </p>
                    </div>
                    <div className="text-sm text-ink-700">
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        <span>{grievanceOfficer.address}</span>
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 rounded-xl bg-white px-4 py-3 text-xs text-ink-600 ring-1 ring-ink-100">
                    {grievanceOfficer.responseSla}.
                  </p>
                </div>

                {/* Cross-links */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                    Related documents
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {otherDocs
                      .filter((d) => d.slug !== doc.slug)
                      .map((d) => (
                        <Link
                          key={d.slug}
                          href={`/legal/${d.slug}`}
                          className="group flex items-start justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-brand-300 hover:shadow-soft"
                        >
                          <div>
                            <p className="font-semibold text-ink-900 group-hover:text-brand-700">
                              {d.title}
                            </p>
                            <p className="mt-1 text-xs text-ink-500">
                              {d.eyebrow}
                            </p>
                          </div>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-brand-700" />
                        </Link>
                      ))}
                  </div>
                </div>
              </div>
            </article>
          </div>
        </Container>
      </Section>
    </>
  );
}

function SectionRenderer({ section }: { section: LegalSection }) {
  return (
    <section id={section.id} className="scroll-mt-28">
      <h2 className="font-display text-2xl font-bold text-ink-900 md:text-3xl">
        {section.heading}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-700">
        {section.body.map((block, i) => {
          if (typeof block === "string") {
            return <p key={i}>{block}</p>;
          }
          if ("list" in block) {
            return (
              <ul
                key={i}
                className="list-disc space-y-2 pl-6 marker:text-brand-500"
              >
                {block.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          }
          if ("table" in block) {
            return (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-ink-100"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-500">
                      <tr>
                        {block.table.headers.map((h) => (
                          <th key={h} className="px-4 py-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 text-ink-700">
                      {block.table.rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-ink-50/60">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-4 py-3 align-top">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </section>
  );
}
