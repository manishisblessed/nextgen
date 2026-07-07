"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Check, ExternalLink } from "lucide-react";
import { detectInAppBrowser, type InAppBrowserInfo } from "@/lib/inAppBrowser";

/**
 * Shown before the camera steps when the page is running inside an app's
 * embedded browser (WhatsApp, Instagram, …), where camera/mic prompts are
 * silently auto-denied. Renders nothing in a real browser.
 */
export function InAppBrowserWarning() {
  // Detect after mount only — UA sniffing during SSR/hydration would mismatch.
  const [info, setInfo] = useState<InAppBrowserInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInfo(detectInAppBrowser());
  }, []);

  if (!info?.inApp) return null;

  const appLabel = info.appName ? `${info.appName}'s built-in browser` : "an app's built-in browser";

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable in WebViews — legacy fallback.
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } finally {
        document.body.removeChild(ta);
      }
    }
    setTimeout(() => setCopied(false), 2500);
  }

  function openInChrome() {
    const { host, pathname, search, href } = window.location;
    window.location.href =
      `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div className="space-y-1 text-sm text-rose-800">
          <p className="font-semibold">
            You&apos;re viewing this page inside {appLabel}.
          </p>
          <p className="text-xs leading-relaxed">
            The camera and microphone <strong>will not work here</strong>, so the
            selfie and video steps will fail. Please open this link in{" "}
            <strong>{info.os === "ios" ? "Safari" : "Chrome"}</strong> to continue.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {info.os === "android" && (
          <button
            type="button"
            onClick={openInChrome}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in Chrome
          </button>
        )}
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Link copied — paste it in{" "}
              {info.os === "ios" ? "Safari" : "Chrome"}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </>
          )}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-rose-600">
        Tip: look for an <strong>&quot;Open in browser&quot;</strong> option in the{" "}
        {info.appName ?? "app"} menu (usually the ⋮ or share icon at the top).
      </p>
    </div>
  );
}
