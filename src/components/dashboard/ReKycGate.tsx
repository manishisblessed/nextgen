"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, CalendarClock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ReKycStatus = {
  reKycRequired: boolean;
  reKycDueAt: string | null;
  lastReKycAt: string | null;
  isNetworkTier: boolean;
};

/**
 * Blocking monthly Re-KYC prompt (Phase 13). Polls the per-user status and, when
 * a network user owes re-verification, overlays a non-dismissible modal routing
 * to /dashboard/rekyc. Staff/admin roles never trigger it (the API returns
 * reKycRequired=false for them). The modal hides itself on the re-KYC page so
 * the user can actually complete the flow.
 */
export function ReKycGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<ReKycStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/rekyc/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setStatus(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  const onReKycPage = pathname?.startsWith("/dashboard/rekyc");
  const show = !!status?.reKycRequired && status.isNetworkTier && !onReKycPage;

  if (!show) return null;

  const due = status?.reKycDueAt
    ? new Date(status.reKycDueAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AnimatePresence>
      <motion.div
        key="rekyc-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink-900/60 p-4 backdrop-blur-sm"
      >
        <motion.div
          key="rekyc-modal"
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl ring-1 ring-ink-900/5"
        >
          <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-amber-500 via-brand-500 to-accent-500" />

          <div className="space-y-5 px-6 pb-6 pt-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-50 to-brand-50 ring-1 ring-amber-100">
                <ShieldAlert className="h-8 w-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-ink-900">Monthly identity check</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                To keep your account secure, please re-verify your identity for this
                month. Transactions are paused until you complete this quick check.
              </p>
            </div>

            {due && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <CalendarClock className="h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-900">
                  Re-verification due for{" "}
                  <span className="font-semibold">{due}</span>.
                </p>
              </div>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={() => router.push("/dashboard/rekyc")}
            >
              Verify now <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="text-center text-xs text-ink-400">
              You can still view your dashboard, but money movement is disabled
              until verification is complete.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
