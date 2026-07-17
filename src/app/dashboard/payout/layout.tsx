"use client";

import { SchemeGateOverlay } from "@/components/dashboard/SchemeGateOverlay";

export default function PayoutLayout({ children }: { children: React.ReactNode }) {
  return <SchemeGateOverlay>{children}</SchemeGateOverlay>;
}
