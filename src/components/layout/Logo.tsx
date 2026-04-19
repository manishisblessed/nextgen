import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({
  className,
  size = 36
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 drop-shadow-[0_8px_20px_rgba(24,93,245,0.35)] transition-transform group-hover:scale-105", className)}
      role="img"
      aria-label="Payprism logo"
    >
      <defs>
        <linearGradient id="ppmBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f7bff" />
          <stop offset="55%" stopColor="#185df5" />
          <stop offset="100%" stopColor="#1448dc" />
        </linearGradient>
        <linearGradient id="ppmShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ppmRayWarm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffd388" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffd388" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ppmRayCoral" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff9a7a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff9a7a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ppmRayCyan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7fe1ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7fe1ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ppmGlow" cx="0.3" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#ppmBg)" />
      <rect width="64" height="64" rx="14" fill="url(#ppmGlow)" />
      <rect width="64" height="64" rx="14" fill="url(#ppmShine)" />
      <path d="M42 21 L58 13 L60 17 L43 26 Z" fill="url(#ppmRayWarm)" />
      <path d="M42 28 L62 28 L62 33 L42 33 Z" fill="url(#ppmRayCoral)" />
      <path d="M42 35 L60 44 L58 48 L42 39 Z" fill="url(#ppmRayCyan)" />
      <path
        d="M 13 13 L 36 13 C 42.6 13, 47 17.4, 47 24 C 47 30.6, 42.6 35, 36 35 L 22 35 L 22 51 L 13 51 Z"
        fill="#ffffff"
      />
      <path d="M 22 19 L 38 19 L 22 33 Z" fill="url(#ppmBg)" />
      <rect x="11" y="11" width="9" height="2" rx="1" fill="#ffffff" opacity="0.45" />
      <circle cx="52" cy="52" r="3.2" fill="#34d399" />
      <circle
        cx="52"
        cy="52"
        r="3.2"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
    </svg>
  );
}

export function Logo({
  className,
  variant = "dark",
  showTagline = true
}: {
  className?: string;
  variant?: "dark" | "light";
  showTagline?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-3", className)}
      aria-label="Payprism home"
    >
      <LogoMark size={40} />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            "font-display text-[17px] font-extrabold tracking-tight",
            variant === "light" ? "text-white" : "text-ink-900"
          )}
        >
          Pay
          <span
            className={cn(
              "bg-gradient-to-r bg-clip-text text-transparent",
              variant === "light"
                ? "from-cyan-200 to-amber-200"
                : "from-brand-600 to-accent-500"
            )}
          >
            prism
          </span>
        </span>
        {showTagline ? (
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.22em]",
              variant === "light" ? "text-white/70" : "text-ink-500"
            )}
          >
            Banking · Bills · Travel
          </span>
        ) : null}
      </span>
    </Link>
  );
}
