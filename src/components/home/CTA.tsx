import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function CTA() {
  return (
    <Section className="pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-10 text-white shadow-glow md:p-16">
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.08]" />
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-accent-300/20 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
                Ready to start?
              </span>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
                Become a Payprism agent in under 5 minutes.
              </h2>
              <p className="mt-4 max-w-xl text-base text-white/85 md:text-lg">
                Sign up, complete eKYC and start offering 60+ digital services
                from your shop today. Earn from your very first transaction.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Link href="/register">
                <Button size="lg" variant="accent">
                  Become an Agent <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 bg-white/10 text-white hover:border-white hover:bg-white hover:text-ink-900"
                >
                  <MessageSquare className="h-4 w-4" />
                  Talk to sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
