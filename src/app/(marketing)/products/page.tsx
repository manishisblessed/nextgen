import type { Metadata } from "next";
import Link from "next/link";
import { Smartphone, Laptop2, Building2, Code2, ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Products"
};

const products = [
  {
    name: "Payprism Retailer App",
    icon: Smartphone,
    text: "Android & iOS app for retailers — accept payments, recharge, transfer money & track commissions on the go.",
    badge: "Most popular",
    cta: "Download app"
  },
  {
    name: "Payprism Web Dashboard",
    icon: Laptop2,
    text: "Powerful web dashboard with reports, exports, multi-user roles and real-time analytics.",
    cta: "Open dashboard"
  },
  {
    name: "Payprism Distributor Suite",
    icon: Building2,
    text: "Manage hundreds of retailers, set commission overrides, monitor settlements and more.",
    cta: "Talk to sales"
  },
  {
    name: "Payprism Developer APIs",
    icon: Code2,
    text: "Plug Payprism's payment, AePS, BBPS and travel APIs into your own product with developer-first docs.",
    cta: "Read docs"
  }
];

export default function ProductsPage() {
  return (
    <>
      <PageHero
        eyebrow="Products"
        title={<>One platform, <span className="gradient-text">four powerful products</span></>}
        description="From a retailer's pocket to an enterprise's API stack — Payprism has the right product for your scale."
      />

      <Section className="bg-white">
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.name}
                  className="group relative overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-white to-ink-50/40 p-8 shadow-sm transition hover:shadow-soft"
                >
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-brand-100 to-accent-100 opacity-50 blur-2xl transition group-hover:opacity-100" />
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-glow">
                      <Icon className="h-6 w-6" />
                    </span>
                    {p.badge && (
                      <span className="rounded-full bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-700">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold text-ink-900">
                    {p.name}
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-ink-600">{p.text}</p>
                  <div className="mt-6">
                    <Link href="/register">
                      <Button variant="outline">
                        {p.cta} <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>
    </>
  );
}
