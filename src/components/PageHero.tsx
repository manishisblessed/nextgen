import { Container } from "@/components/ui/Container";

export function PageHero({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white pb-12 pt-12 md:pb-16 md:pt-20">
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.06]" />
      <Container>
        <div className="max-w-3xl">
          {eyebrow && <span className="eyebrow mb-4">{eyebrow}</span>}
          <h1 className="heading-xl mt-2">{title}</h1>
          {description && <p className="lead mt-5">{description}</p>}
        </div>
      </Container>
    </section>
  );
}
