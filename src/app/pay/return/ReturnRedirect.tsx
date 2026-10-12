"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * After the payment-return page is shown, forward the customer back to the
 * wallet they started from — carrying `?topup=<ref>` so the wallet page's
 * existing resume logic picks the top-up up, polls it, and reflects the credit.
 *
 * This is a same-origin client navigation, so the session cookie is present and
 * the user is NOT bounced to the login wall.
 */
export function ReturnRedirect({ to, delayMs = 2500 }: { to: string; delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      // Star PG renders this return page INSIDE a chagans.com iframe. A normal
      // in-iframe navigation to the (auth-gated) wallet is cross-site, so the
      // session cookie isn't sent and the user hits the login wall. Break OUT to
      // the top-level browsing context with an absolute URL so the cookie rides
      // along and the customer lands on their wallet. Comet redirects top-level
      // (not framed), so this falls through to a normal same-tab navigation.
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = new URL(to, window.location.href).href;
          return;
        }
      } catch {
        /* cross-origin parent blocked read — fall through to same-frame nav */
      }
      router.replace(to);
    }, delayMs);
    return () => clearTimeout(t);
  }, [to, delayMs, router]);
  return null;
}
