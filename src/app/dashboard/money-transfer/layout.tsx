"use client";

import { SchemeGateOverlay } from "@/components/dashboard/SchemeGateOverlay";

export default function MoneyTransferLayout({ children }: { children: React.ReactNode }) {
  return <SchemeGateOverlay>{children}</SchemeGateOverlay>;
}
