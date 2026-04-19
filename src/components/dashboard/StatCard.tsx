import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  trend = "up",
  icon: Icon,
  accent = "brand"
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  accent?: "brand" | "accent" | "emerald" | "violet";
}) {
  const accents: Record<string, string> = {
    brand: "from-brand-500 to-brand-700",
    accent: "from-accent-500 to-accent-600",
    emerald: "from-emerald-500 to-emerald-700",
    violet: "from-violet-500 to-violet-700"
  };

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-soft",
            accents[accent]
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
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
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-ink-500">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}
