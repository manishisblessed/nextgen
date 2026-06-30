import crypto from "crypto";
import { prisma } from "../db";
import { securityLogger } from "../logger";

/**
 * Structured security logging + lightweight anomaly detection.
 *
 * Every security-relevant event is written both to the structured logger
 * (pino → stdout → CloudWatch/SIEM) and, when it concerns a real action, to the
 * AuditLog table so it surfaces in the admin audit view. Anomaly flags
 * (impossible travel, new device, repeated failures) are attached to the login
 * event meta so an operator can spot account-takeover attempts.
 */

export type SecuritySeverity = "info" | "warn" | "danger";

export type SecurityEvent = {
  action: string; // e.g. "auth.login", "auth.login_failed", "auth.locked"
  severity?: SecuritySeverity;
  userId?: string | null;
  entity?: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
  /** When false, only the structured logger is written (no DB row). */
  persist?: boolean;
};

/** Stable, non-reversible fingerprint of a device/user-agent string. */
export function deviceHash(userAgent: string | null | undefined): string {
  return crypto
    .createHash("sha256")
    .update((userAgent ?? "unknown").slice(0, 512))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Number of trusted reverse-proxy hops in front of the app. Our deployment is
 * a single nginx hop (EC2 → nginx → Node). nginx uses `$proxy_add_x_forwarded_for`
 * which APPENDS the connecting peer to any inbound `X-Forwarded-For`. A malicious
 * client can therefore prepend spoofed values, but only the *right-most*
 * `TRUSTED_PROXY_HOPS` entries are added by infrastructure we control. If a CDN
 * (e.g. Cloudflare) is later placed in front of nginx, bump this to 2.
 */
const TRUSTED_PROXY_HOPS = (() => {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
})();

/**
 * Resolve the real client IP from forwarding headers WITHOUT trusting
 * attacker-controlled values.
 *
 * Security: never take the left-most `X-Forwarded-For` entry — that part is
 * fully client-controlled and is the classic spoofing / cache-key / rate-limit
 * bypass vector. We take the entry our trusted nginx hop appended (counting
 * `TRUSTED_PROXY_HOPS` from the right). `X-Forwarded-Host` / `Host` are NEVER
 * read here and must never be used to build URLs, links, or cache keys.
 */
export function clientIpFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      // The hop our nginx added sits TRUSTED_PROXY_HOPS from the right.
      const idx = Math.max(0, parts.length - TRUSTED_PROXY_HOPS);
      const candidate = parts[idx];
      if (candidate) return candidate;
    }
  }
  // nginx sets X-Real-IP = $remote_addr (the directly-connected peer), which a
  // remote client cannot forge across the proxy. Prefer it as the fallback.
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** Pull the trusted client IP from a request's forwarding headers. */
export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers);
}

/**
 * Record a security event. Failures here must never break the calling request,
 * so DB writes are best-effort (logged on failure).
 */
export async function logSecurityEvent(evt: SecurityEvent): Promise<void> {
  const severity = evt.severity ?? "info";
  securityLogger[severity === "danger" ? "warn" : severity]({
    action: evt.action,
    severity,
    userId: evt.userId ?? undefined,
    entity: evt.entity,
    entityId: evt.entityId ?? undefined,
    ip: evt.ip ?? undefined,
    deviceHash: deviceHash(evt.userAgent),
    ...evt.meta,
  });

  if (evt.persist === false) return;

  try {
    await prisma.auditLog.create({
      data: {
        userId: evt.userId ?? null,
        action: evt.action,
        entity: evt.entity ?? "Security",
        entityId: evt.entityId ?? null,
        meta: { severity, ...(evt.meta ?? {}) },
        ip: evt.ip ?? null,
        userAgent: evt.userAgent ?? null,
      },
    });
  } catch (err) {
    securityLogger.error({ action: "audit.persist_failed", err: String(err) });
  }
}

// ─── Anomaly detection ──────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
/** Plausible upper bound for travel speed (commercial flight + buffer). */
const MAX_PLAUSIBLE_KMH = 1000;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type LoginAnomalies = {
  newDevice: boolean;
  impossibleTravel: boolean;
  repeatedFailures: boolean;
  /** Computed travel speed in km/h between the last and current login (if any). */
  travelKmh?: number;
  distanceKm?: number;
  flagged: boolean;
};

export type LoginContext = {
  lastLoginLat?: number | null;
  lastLoginLng?: number | null;
  lastLoginAt?: Date | null;
  knownDevices: string[];
  lat: number;
  lng: number;
  userAgent: string | null;
  recentFailures?: number;
};

/**
 * Compute anomaly flags for a successful login by comparing against the user's
 * last known login context. Pure function — does not touch the DB.
 */
export function detectLoginAnomalies(ctx: LoginContext): LoginAnomalies {
  const device = deviceHash(ctx.userAgent);
  const newDevice = ctx.knownDevices.length > 0 && !ctx.knownDevices.includes(device);

  let impossibleTravel = false;
  let travelKmh: number | undefined;
  let distanceKm: number | undefined;

  if (
    ctx.lastLoginLat != null &&
    ctx.lastLoginLng != null &&
    ctx.lastLoginAt != null &&
    Number.isFinite(ctx.lat) &&
    Number.isFinite(ctx.lng)
  ) {
    distanceKm = haversineKm(ctx.lastLoginLat, ctx.lastLoginLng, ctx.lat, ctx.lng);
    const hours = (Date.now() - ctx.lastLoginAt.getTime()) / 3_600_000;
    if (hours > 0 && distanceKm > 50) {
      travelKmh = distanceKm / hours;
      impossibleTravel = travelKmh > MAX_PLAUSIBLE_KMH;
    }
  }

  const repeatedFailures = (ctx.recentFailures ?? 0) >= 3;

  return {
    newDevice,
    impossibleTravel,
    repeatedFailures,
    travelKmh,
    distanceKm,
    flagged: newDevice || impossibleTravel || repeatedFailures,
  };
}
