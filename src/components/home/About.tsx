import { PlayCircle, Users2, TrendingUp } from "lucide-react";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function About() {
  return (
    <Section className="bg-white">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <div className="relative">
              <div className="overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-brand-50 to-accent-50 p-10 shadow-soft">
                <div className="grid gap-4">
                  <div className="rounded-2xl bg-white/80 p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
                        <Users2 className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-display text-2xl font-bold text-ink-900">
                          38M+
                        </p>
                        <p className="text-xs text-ink-500">Businesses joined</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                        <TrendingUp className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-display text-2xl font-bold text-ink-900">
                          0%
                        </p>
                        <p className="text-xs text-ink-500">
                          Hidden fees on any transaction
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="absolute -bottom-6 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-ink-100 bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-soft hover:text-brand-700"
              >
                <PlayCircle className="h-5 w-5 text-brand-600" />
                Watch our story
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <span className="eyebrow">About Payprism</span>
            <h2 className="heading-lg mt-4">
              Digitizing financial services for every corner of India
            </h2>
            <p className="lead mt-4">
              We simplify high-end financial technology so it can be assimilated
              at the last mile — transforming the lives of our retail partners
              and the customers they serve. From a Tier-1 metro to a remote
              village in Bihar, Payprism makes formal banking and
              digital services available, affordable and instant.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="font-display text-3xl font-bold text-brand-700">
                  10+ years
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  of fintech experience powering retailers across India.
                </p>
              </div>
              <div>
                <p className="font-display text-3xl font-bold text-accent-600">
                  ₹3,200 Cr
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  in transactions processed monthly across our network.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button>Learn more about us</Button>
              <Button variant="outline">Download brochure</Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
