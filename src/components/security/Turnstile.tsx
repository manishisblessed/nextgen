"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile (CAPTCHA) widget. Renders nothing unless
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured, so local dev / tests work
 * without a key. When configured, it loads the Turnstile script (allowlisted in
 * the CSP) and emits a verification token via `onToken`. The token is sent as
 * `captchaToken` to the auth endpoints, which verify it server-side.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** True when a site key is present (so callers can require a token before submit). */
export const captchaConfigured = Boolean(SITE_KEY);

export function Turnstile({
  onToken,
  className,
}: {
  onToken: (token: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const render = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onToken(token),
      "error-callback": () => onToken(""),
      "expired-callback": () => onToken(""),
      theme: "auto",
    });
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;

    if (window.turnstile) {
      render();
      return;
    }

    const id = "cf-turnstile-script";
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);

    return () => {
      script?.removeEventListener("load", render);
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
        widgetId.current = null;
      }
    };
  }, [render]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className={className} />;
}
