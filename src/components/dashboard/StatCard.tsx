import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCENT_MAP: Record<
  string,
  { gradient: string; bgLight: string; textAccent: string }
> = {
  brand: {
    gradient: "from-brand-500 via-brand-600 to-indigo-700",
    bgLight: "bg-brand-50",
    textAccent: "text-brand-700",
  },
  accent: {
    gradient: "from-orange-400 via-amber-500 to-yellow-500",
    bgLight: "bg-amber-50",
    textAccent: "text-amber-700",
  },
  emerald: {
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    bgLight: "bg-emerald-50",
    textAccent: "text-emerald-700",
  },
  violet: {
    gradient: "from-violet-500 via-purple-600 to-fuchsia-600",
    bgLight: "bg-violet-50",
    textAccent: "text-violet-700",
  },
};

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
  const a = ACCENT_MAP[accent] ?? ACCENT_MAP.brand;

  const card = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-4 shadow-sm",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
        href && "cursor-pointer"
      )}
    >
      {/* top gradient strip */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r",
          a.gradient
        )}
      />
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            a.gradient
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
      <p className="mt-0.5 font-display text-xl font-bold text-ink-900">
        {value}
      </p>
      {href && (
        <div
          className={cn(
            "mt-2 flex items-center gap-0.5 text-[11px] font-semibold",
            a.textAccent
          )}
        >
          View
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}
