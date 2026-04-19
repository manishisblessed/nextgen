import { ShieldCheck } from "lucide-react";
import { trustBadges } from "@/lib/data";

const partners = [
  "NPCI",
  "RBI Authorised",
  "Visa",
  "Mastercard",
  "RuPay",
  "BBPS",
  "IRCTC",
  "FASTag",
  "UIDAI"
];

export function TrustMarquee() {
  return (
    <section className="border-y border-ink-100 bg-ink-50/60 py-8">
      <div className="container-x">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            Trusted by 38M+ Indian businesses
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {trustBadges.map((b) => (
              <div
                key={b.label}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {b.label}
              </div>
            ))}
          </div>
        </div>

        <div className="mask-fade-x mt-6 overflow-hidden">
          <div className="flex w-max animate-marquee gap-12">
            {[...partners, ...partners].map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="font-display text-lg font-semibold text-ink-400"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
