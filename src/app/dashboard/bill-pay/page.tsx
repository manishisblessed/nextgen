import Link from "next/link";
import { ArrowRight, CreditCard, Receipt } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * BBPS hub — landing page reached from the retailer dashboard "BBPS" card.
 * Presents every bill-payment rail as a card; the retailer picks whichever
 * they want. `maxAmount` is the per-transaction ceiling enforced by each
 * rail's form (see CreditCardBillForm / BbpsBillForm — default ₹5,00,000).
 */
type BillOption = {
  title: string;
  description: string;
  href: string;
  maxAmount: number;
};

const BILL_OPTIONS: BillOption[] = [
  {
    title: "Credit Card Bill Payment",
    description:
      "Pay credit card bills across all major banks via Same Day BBPS — fetch the live bill with the card's last 4 digits and registered mobile.",
    href: "/dashboard/bill-pay/credit-card",
    maxAmount: 500000,
  },
  {
    title: "Credit Card Bill Payment-2",
    description:
      "Pay credit card bills directly — enter the full card number, bank details, and amount. Charges are shown before confirmation.",
    href: "/dashboard/bill-pay/cc-pay",
    maxAmount: 500000,
  },
  {
    title: "BBPS-Bharat BillPay",
    description:
      "Bill payments powered by Bharat BillPay — credit card, electricity, water, gas, education, insurance, and broadband.",
    href: "/dashboard/bill-pay/bbps-1",
    maxAmount: 500000,
  },
  {
    title: "Unified Bill Payment Platform",
    description:
      "Utility bill payments — electricity, water, gas, education, insurance, and broadband via the Unified Bill Payment Platform.",
    href: "/dashboard/bill-pay/bbps-2",
    maxAmount: 500000,
  },
];

export default function BillPayHubPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ServicePageHeader
        icon={Receipt}
        title="BBPS — Bill Payments"
        description="Choose a bill-payment option below. Each rail supports different banks and categories — pick whichever suits your customer."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {BILL_OPTIONS.map((opt) => (
          <Link
            key={opt.href}
            href={opt.href}
            className="group flex flex-col rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-soft">
                <CreditCard className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
            </div>
            <h3 className="mt-4 font-display text-base font-semibold text-ink-900">
              {opt.title}
            </h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-500">
              {opt.description}
            </p>
            <div className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              Max {formatINR(opt.maxAmount)} per transaction
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
