import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-8 w-8",
  page: "h-10 w-10",
} as const;

export function Spinner({
  size = "md",
  className,
  label = "Loading",
}: {
  size?: keyof typeof sizeMap;
  className?: string;
  label?: string;
}) {
  return (
    <Loader2
      className={cn("animate-spin text-brand-600", sizeMap[size], className)}
      aria-label={label}
      role="status"
    />
  );
}

export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-500">
        <Spinner size="page" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}
