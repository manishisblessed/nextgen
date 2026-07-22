"use client";

import { AlertTriangle } from "lucide-react";
import { useSchemeGate } from "@/lib/useSchemeGate";

/**
 * Scheme gate banner: network users without an assigned active scheme
 * cannot transact. Shown on every dashboard page until admin assigns a scheme.
 */
export function SchemeGateBanner() {
  const { blocked } = useSchemeGate();

  if (!blocked) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p className="font-semibold">Transactions are disabled — no scheme assigned yet</p>
        <p className="mt-0.5 text-amber-800">
          Your admin must assign you a scheme before you can perform payouts, bill
          payments, settlements or any other transaction. Contact your admin to get activated.
        </p>
      </div>
    </div>
  );
}
