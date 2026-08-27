"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/isChunkLoadError";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    // A stale chunk means the app was updated under the user's feet — recover
    // automatically with a hard reload instead of surfacing a dead end. Only
    // report genuine faults to Sentry.
    if (chunkError) {
      reloadOnceForChunkError();
    } else {
      Sentry.captureException(error);
    }
  }, [error, chunkError]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            background: "#fef2f2",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              textAlign: "center",
              background: "#fff",
              borderRadius: 16,
              padding: "2rem",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111" }}>
              {chunkError ? "Updating to the latest version" : "Something went wrong"}
            </h2>
            <p style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
              {chunkError
                ? "A new version is available. Reloading to get the latest — this only takes a moment."
                : error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => (chunkError ? window.location.reload() : reset())}
              style={{
                marginTop: 20,
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {chunkError ? "Reload now" : "Try again"}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
