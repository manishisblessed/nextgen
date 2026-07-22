"use client";

import { ShieldOff } from "lucide-react";
import { useSchemeGate } from "@/lib/useSchemeGate";

/**
 * Blocks the wrapped content when the user has no active scheme assigned.
 * Unlike SchemeGateBanner (advisory warning), this prevents interaction
 * entirely — used on transaction pages (BBPS, Payout, Recharges, etc.)
 * so users don't fill out forms only to hit a backend 403.
 */
export function SchemeGateOverlay({ children }: { children: React.ReactNode }) {
  const { blocked, isLoading } = useSchemeGate();

  if (isLoading) return <>{children}</>;
  if (!blocked) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-25 blur-[2px]" aria-hidden>
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16">
        <div className="mx-4 max-w-lg rounded-2xl border border-amber-300 bg-amber-50 px-8 py-8 text-center shadow-lg">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-100">
            <ShieldOff className="h-7 w-7 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-amber-900">
            Transactions are disabled
          </h3>
          <p className="mt-2 text-sm text-amber-800">
            Your admin must assign you a scheme before you can
            use this service. Contact your admin to get activated.
          </p>
        </div>
      </div>
    </div>
  );
}
