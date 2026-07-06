import { describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  detectLoginAnomalies,
  deviceHash,
} from "@/lib/security/audit";

/**
 * Security primitives: trusted-IP resolution (rate-limit / audit keying) and
 * login anomaly detection (account-takeover signals).
 */

describe("clientIpFromHeaders", () => {
  it("takes the right-most trusted hop, not the client-controlled left-most", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" });
    // With 1 trusted hop, the entry appended by our nginx is 1.2.3.4.
    expect(clientIpFromHeaders(h)).toBe("1.2.3.4");
  });

  it("cannot be spoofed by prepending fake entries", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 1.2.3.4" });
    expect(clientIpFromHeaders(h)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("deviceHash", () => {
  it("is stable and non-reversible-looking", () => {
    const a = deviceHash("Mozilla/5.0 (Windows NT 10.0)");
    expect(a).toBe(deviceHash("Mozilla/5.0 (Windows NT 10.0)"));
    expect(a).toHaveLength(32);
    expect(a).not.toContain("Mozilla");
  });
});

describe("detectLoginAnomalies", () => {
  const base = {
    lastLoginLat: 28.6139, // Delhi
    lastLoginLng: 77.209,
    lastLoginAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    knownDevices: [deviceHash("known-agent")],
    userAgent: "known-agent",
    lat: 28.62,
    lng: 77.21,
  };

  it("clean login from a known device nearby is not flagged", () => {
    const r = detectLoginAnomalies(base);
    expect(r.flagged).toBe(false);
  });

  it("flags a new device once devices are known", () => {
    const r = detectLoginAnomalies({ ...base, userAgent: "brand-new-agent" });
    expect(r.newDevice).toBe(true);
    expect(r.flagged).toBe(true);
  });

  it("flags impossible travel (Delhi → New York in 1 hour)", () => {
    const r = detectLoginAnomalies({ ...base, lat: 40.7128, lng: -74.006 });
    expect(r.impossibleTravel).toBe(true);
    expect(r.flagged).toBe(true);
    expect((r.travelKmh ?? 0) > 1000).toBe(true);
  });

  it("does not flag plausible travel (Delhi → Jaipur in 1 day)", () => {
    const r = detectLoginAnomalies({
      ...base,
      lastLoginAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      lat: 26.9124,
      lng: 75.7873,
    });
    expect(r.impossibleTravel).toBe(false);
  });

  it("flags repeated recent failures", () => {
    const r = detectLoginAnomalies({ ...base, recentFailures: 3 });
    expect(r.repeatedFailures).toBe(true);
    expect(r.flagged).toBe(true);
  });
});
