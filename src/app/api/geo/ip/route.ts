import { NextResponse } from "next/server";
import { clientIp } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/geo/ip
 * Returns an approximate lat/lng derived from the client's IP address.
 * Used as a fallback when the browser's Geolocation API is unavailable or
 * times out (e.g. system location services disabled, prompt dismissed, etc.).
 *
 * Tries ip-api.com (free, no key, 45 req/min) with a tight timeout so the
 * login page never blocks for long.  On failure returns 0/0 so the login
 * form still renders — the server-side login route can decide whether to
 * accept a zero-accuracy location.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);

    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon,city,regionName`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.status === "success") {
        return NextResponse.json({
          latitude: data.lat,
          longitude: data.lon,
          accuracy: 50_000,
          source: "ip",
          city: data.city,
          region: data.regionName,
        });
      }
    }
  } catch {
    // timeout or network error — fall through
  }

  return NextResponse.json({
    latitude: 0,
    longitude: 0,
    accuracy: 100_000,
    source: "ip-fallback",
  });
}
