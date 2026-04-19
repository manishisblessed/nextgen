import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { PageHero } from "@/components/PageHero";
import { company } from "@/lib/data";

const titles: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  refunds: "Refund Policy",
  charges: "Charges & Fees"
};

export function generateStaticParams() {
  return Object.keys(titles).map((slug) => ({ slug }));
}

export function generateMetadata({
  params
}: {
  params: { slug: string };
}): Metadata {
  return { title: titles[params.slug] ?? "Legal" };
}

export default function LegalPage({
  params
}: {
  params: { slug: string };
}) {
  const title = titles[params.slug] ?? "Legal";

  return (
    <>
      <PageHero
        eyebrow="Legal"
        title={title}
        description="Effective from April 2026. Please read the full document carefully."
      />
      <Section className="bg-white">
        <Container>
          <article className="prose prose-ink mx-auto max-w-3xl text-ink-700">
            <p>
              This is a placeholder page for the <strong>{title}</strong> of{" "}
              <strong>{company.legalName}</strong> (CIN: {company.cin}),
              operating under the trade name &ldquo;{company.tradeName}&rdquo;.
              The full, legally-binding document will be published shortly.
            </p>
            <p>
              For any urgent legal queries please write to{" "}
              <a href={`mailto:legal@${company.domain}`}>
                legal@{company.domain}
              </a>{" "}
              or call us at +91 {company.phone}.
            </p>
            <h2 className="mt-6 font-display text-xl font-semibold text-ink-900">
              Summary
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>We use bank-grade encryption to protect your data.</li>
              <li>We never sell or share your data with third parties.</li>
              <li>You can request deletion of your account anytime.</li>
              <li>
                All disputes are subject to the exclusive jurisdiction of courts
                in New Delhi.
              </li>
            </ul>
            <h2 className="mt-6 font-display text-xl font-semibold text-ink-900">
              Registered office
            </h2>
            <p>{company.address}</p>
          </article>
        </Container>
      </Section>
    </>
  );
}
