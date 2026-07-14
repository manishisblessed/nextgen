"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, ArrowRight } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";

type LivenessStatus = {
  isNetworkTier: boolean;
  hasLivenessVideo: boolean;
  status: "UPLOADED" | "BASELINE_READY" | "FAILED" | null;
  required: boolean;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<LivenessStatus>;
};

/**
 * Blocking onboarding liveness prompt. Cached via SWR so sidebar navigation
 * does not re-hit the API on every route change.
 */
export function LivenessGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: status } = useSWR("/api/kyc/video/status", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60_000,
    refreshInterval: 15 * 60_000,
  });

  const onCapturePage = pathname?.startsWith("/dashboard/liveness");
  const show = !!status?.required && status.isNetworkTier && !onCapturePage;

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="liveness-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink-900/60 p-4 backdrop-blur-sm"
      >
        <motion.div
          key="liveness-modal"
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl ring-1 ring-ink-900/5"
        >
          <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-brand-500 via-accent-500 to-emerald-500" />

          <div className="space-y-5 px-6 pb-6 pt-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-emerald-50 ring-1 ring-brand-100">
                <ScanFace className="h-8 w-8 text-brand-600" />
              </div>
              <h2 className="text-xl font-bold text-ink-900">One quick liveness check</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                {status?.status === "FAILED"
                  ? "We couldn't read a clear face from your last video. Please record a quick 10-second video again to activate transactions."
                  : "Before you can transact, please record a quick 10-second liveness video. It confirms your identity and keeps your account secure."}
              </p>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={() => router.push("/dashboard/liveness")}
            >
              Record video <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="text-center text-xs text-ink-400">
              You can still view your dashboard, but money movement is disabled
              until this one-time check is complete.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
