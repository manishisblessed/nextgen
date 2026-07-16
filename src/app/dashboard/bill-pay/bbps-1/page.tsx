"use client";

import { useState } from "react";
import { Receipt, CreditCard } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { CreditCardBillForm } from "@/components/dashboard/CreditCardBillForm";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "credit-card", label: "Credit Card", icon: CreditCard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Bbps1Page() {
  const [tab, setTab] = useState<TabKey>("credit-card");

  return (
    <div className="mx-auto max-w-3xl">
      <ServicePageHeader
        icon={Receipt}
        title="BBPS-1 (Same Day)"
        description="Bill payments powered by Same Day Solution — credit card bill payments with instant confirmation via BBPS."
      />

      <div className="mb-6 flex gap-2 overflow-x-auto rounded-xl border border-ink-100 bg-ink-50 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                tab === t.key
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-ink-500 hover:text-ink-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "credit-card" && <CreditCardBillForm />}
    </div>
  );
}
