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
      className={cn("shrink-0 drop-shadow-[0_8px_20px_rgba(26,26,46,0.35)] transition-transform group-hover:scale-105", className)}
      role="img"
      aria-label="NextGenPay logo"
    >
      <defs>
        <linearGradient id="ngpBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a1a2e" />
          <stop offset="55%" stopColor="#16213e" />
          <stop offset="100%" stopColor="#0f3460" />
        </linearGradient>
        <linearGradient id="ngpBolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e94560" />
          <stop offset="100%" stopColor="#d4a843" />
        </linearGradient>
        <linearGradient id="ngpShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ngpGlow" cx="0.3" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#ngpBg)" />
      <rect width="64" height="64" rx="14" fill="url(#ngpGlow)" />
      <rect width="64" height="64" rx="14" fill="url(#ngpShine)" />
      {/* N monogram — diagonal as a gradient "next" bolt */}
      <rect x="14" y="15" width="8" height="34" rx="2" fill="#ffffff" />
      <rect x="42" y="15" width="8" height="34" rx="2" fill="#ffffff" />
      <path d="M14 15 L22 15 L50 49 L42 49 Z" fill="url(#ngpBolt)" />
      {/* forward chevron — momentum */}
      <path d="M53 20 L58 24.5 L53 29" fill="none" stroke="#d4a843" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
      aria-label="NextGenPay home"
    >
      <LogoMark size={40} />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            "font-display text-[17px] font-extrabold tracking-tight",
            variant === "light" ? "text-white" : "text-ink-900"
          )}
        >
          NextGen
          <span
            className={cn(
              "bg-gradient-to-r bg-clip-text text-transparent",
              variant === "light"
                ? "from-rose-300 to-amber-200"
                : "from-accent-500 to-amber-500"
            )}
          >
            Pay
          </span>
        </span>
        {showTagline ? (
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.22em]",
              variant === "light" ? "text-white/70" : "text-ink-500"
            )}
          >
            PG · POS · QR Payments
          </span>
        ) : null}
      </span>
    </Link>
  );
}
