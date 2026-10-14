"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * After the payment-return page is shown, forward the customer back to the
 * wallet they started from — carrying `?topup=<ref>` so the wallet page's
 * existing resume logic picks the top-up up, polls it, and reflects the credit.
 *
 * IMPORTANT — Star PG renders this page INSIDE a chagans.com iframe. Two traps:
 *   1. A programmatic top-level navigation (`window.top.location`) from a
 *      cross-origin iframe is BLOCKED by the browser unless it's triggered by a
 *      user gesture — a setTimeout is not one, so it silently fails.
 *   2. Navigating the iframe itself to the auth-gated wallet is a cross-site
 *      request, so the SameSite session cookie isn't sent and the user is
 *      bounced to the login wall (what we were seeing).
 * So when we're framed we do NOT auto-navigate at all: we leave the "Payment
 * received" page up and let the user tap "Go to my wallet" — that anchor uses
 * target="_top", and a real click IS a valid gesture that breaks out of the
 * frame to a top-level (cookie-bearing) navigation.
 *
 * When NOT framed (Comet redirects top-level), we auto-forward to the wallet.
 */
export function ReturnRedirect({ to, delayMs = 2500 }: { to: string; delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    // Detect an iframe safely (cross-origin access to window.top can throw).
    let framed = false;
    try {
      framed = window.top !== window.self;
    } catch {
      framed = true;
    }
    // Framed (Star): do nothing — avoid the login-wall bounce; the user's click
    // on the target="_top" button is the only safe way out of the frame.
    if (framed) return;

    const t = setTimeout(() => router.replace(to), delayMs);
    return () => clearTimeout(t);
  }, [to, delayMs, router]);
  return null;
}
