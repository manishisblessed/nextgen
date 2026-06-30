import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { MAX_BODY_BYTES } from "@/lib/env";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Nonce-based Content-Security-Policy.
 *
 * A fresh nonce is generated per request and:
 *   1. injected into the *request* headers as `x-nonce` so Next.js applies it
 *      to the framework's own inline bootstrap scripts (and our components can
 *      read it from `headers()`), and
 *   2. sent back in the response CSP header.
 *
 * This removes script-src 'unsafe-inline' (the old policy). Inline styles still
 * require 'unsafe-inline' because Tailwind/styled-jsx/next-font emit inline
 * <style> tags — acceptable, since CSS injection is far lower risk than JS.
 * Cloudflare Turnstile (CAPTCHA) is explicitly allowlisted for script/frame/
 * connect so it works when SECURITY_CAPTCHA_ENABLED is on.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://api.qrserver.com https://images.unsplash.com https://api.dicebear.com",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const ADMIN_PATHS: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/dashboard/master-admin", roles: ["MASTER_ADMIN"] },
  { prefix: "/dashboard/sub-admin", roles: ["SUPPORT", "MASTER_ADMIN"] },
  { prefix: "/dashboard/admin", roles: ["MASTER_ADMIN", "ADMIN", "SUPPORT"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. Request-size limit on mutating API calls (defense vs oversized bodies)
  if (pathname.startsWith("/api/") && ["POST", "PUT", "PATCH"].includes(req.method)) {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }
  }

  // ── 2. Per-request CSP nonce
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  // ── 3. Auth gate for dashboard routes (replaces withAuth wrapper so we keep
  //       full control of the response headers).
  if (pathname.startsWith("/dashboard")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    const role = (token.role as string) ?? "";
    const rule = ADMIN_PATHS.find((r) => pathname.startsWith(r.prefix));
    if (rule && !rule.roles.includes(role)) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);

  // ── 4. Anti cache-deception / poisoning / replay.
  //       No cache (browser, nginx, CDN) may ever store authenticated HTML or
  //       API responses. Scoped to /dashboard and /api only — /_next/static,
  //       /_next/image and public assets are already excluded by the matcher,
  //       so their long-lived immutable caching is untouched.
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api")) {
    res.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    // Caches that key on the response must vary by the auth cookie so a shared
    // cache can never serve one user's authenticated response to another.
    res.headers.set("Vary", "Cookie");
  }

  return res;
}

export const config = {
  // Run on everything except static assets so the CSP applies to all documents.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?)$).*)",
  ],
};
