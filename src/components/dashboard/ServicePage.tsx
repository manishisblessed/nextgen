import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function ServicePageHeader({
  icon: Icon,
  title,
  description,
  back = "/dashboard"
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  back?: string;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-glow">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <Link
            href={back}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            <ChevronLeft className="h-3 w-3" /> Back
          </Link>
          <h1 className="font-display text-2xl font-bold text-ink-900 md:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">{description}</p>
        </div>
      </div>
    </div>
  );
}
