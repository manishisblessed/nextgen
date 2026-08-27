"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/isChunkLoadError";

/**
 * Error boundary for everything under /dashboard. Its most common trigger is a
 * ChunkLoadError when a user on an older build navigates to a route whose lazy
 * chunk was rotated by a redeploy — so we recover automatically with a guarded
 * hard reload rather than trapping them behind a dead "Try again".
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (chunkError) {
      reloadOnceForChunkError();
    } else {
      Sentry.captureException(error);
    }
  }, [error, chunkError]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-sm">
        <span
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
            chunkError ? "bg-brand-50 text-brand-600" : "bg-rose-50 text-rose-600"
          }`}
        >
          {chunkError ? (
            <RefreshCw className="h-7 w-7 animate-spin" />
          ) : (
            <AlertTriangle className="h-7 w-7" />
          )}
        </span>

        <h2 className="mt-5 font-display text-lg font-bold text-ink-900">
          {chunkError ? "Updating to the latest version" : "Something went wrong"}
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          {chunkError
            ? "A new version is available. Reloading to get the latest — this only takes a moment."
            : error.message || "An unexpected error occurred while loading this page."}
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {chunkError ? (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" /> Reload now
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button onClick={reset}>Try again</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
