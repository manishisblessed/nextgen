"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { bankLogoPath } from "@/lib/bank-logos";
import { cn } from "@/lib/utils";

/**
 * Bank / credit-card issuer logo tile.
 *
 * Resolves the real self-hosted SVG for an operator name (case-insensitive,
 * tolerant of "CREDIT CARD"/"ONE"/"CARD" noise words — see `lib/bank-logos`)
 * and renders it inside a fixed, white, rounded container with `object-contain`
 * so the artwork is never stretched or distorted.
 *
 * When no logo matches — or the asset fails to load — it degrades to the
 * generic purple credit-card icon (the app's existing service icon), exactly as
 * required by the fallback spec.
 */
export function BankLogo({
  name,
  size = 42,
  className,
}: {
  /** Raw operator/bank display name from the API (never mutated). */
  name?: string | null;
  /** Square edge length in px. Defaults to 42. */
  size?: number;
  className?: string;
}) {
  const src = bankLogoPath(name);
  const [failed, setFailed] = useState(false);

  // Reset the error state when the resolved logo changes (e.g. list scrolls).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showLogo = !!src && !failed;

  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-white",
        className
      )}
      aria-hidden="true"
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: size - 8, height: size - 8 }}
          className="object-contain"
        />
      ) : (
        // Generic fallback — matches the app's service-page credit-card icon.
        <span className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-600 to-accent-500 text-white">
          <CreditCard style={{ width: size * 0.5, height: size * 0.5 }} />
        </span>
      )}
    </span>
  );
}

/** Semantic alias for credit-card issuer usage. */
export const CreditCardBankLogo = BankLogo;
