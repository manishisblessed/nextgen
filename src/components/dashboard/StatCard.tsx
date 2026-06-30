import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  trend = "up",
  icon: Icon,
  accent = "brand",
  href,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  accent?: "brand" | "accent" | "emerald" | "violet";
  href?: string;
}) {
  const accents: Record<string, string> = {
    brand: "from-brand-500 to-brand-700",
    accent: "from-accent-500 to-accent-600",
    emerald: "from-emerald-500 to-emerald-700",
    violet: "from-violet-500 to-violet-700"
  };

  const card = (
    <div className={cn(
      "rounded-2xl border border-ink-100 bg-white p-4 shadow-sm transition-all",
      href && "cursor-pointer hover:border-brand-200 hover:shadow-md"
    )}>
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-soft",
            accents[accent]
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              trend === "up"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {delta}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-ink-500">
        {label}
      </p>
      <p className="mt-0.5 font-display text-xl font-bold text-ink-900">{value}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}
