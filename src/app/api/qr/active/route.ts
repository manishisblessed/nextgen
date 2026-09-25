import { NextResponse } from "next/server";
import type { QrSettlementKind } from "@prisma/client";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { resolveUserScheme } from "@/lib/scheme/resolve-scheme";
import {
  resolveLiveQr,
  collectedToday,
  peekOverflowQr,
  toRetailerQrPayload,
} from "@/lib/qr/rotation";

/**
 * QR settlement stream is RuPay/UPI (NPCI). We show the retailer the exact
 * scheme MDR that applies to this stream: T+0 (`mdrValueT0`, fallback T+1) for
 * QR-Instant, T+1 (`mdrValue`) for QR-T+1 — mirroring the "My Scheme" rate card.
 */
const QR_BRAND_TYPE = "RUPAY";

type QrRate = { type: "PERCENT" | "FLAT"; value: number };

/**
 * The QR MDR rate the caller's scheme applies for a settlement stream, plus —
 * for T1 — the daily settlement hour (IST). Reads the scheme's QR MDR slab
 * directly (same source as /api/me/scheme) so the % shown on the tab is exactly
 * what settlement deducts. Returns nulls when no QR rate is configured.
 */
async function qrRateInfo(
  userId: string,
  kind: QrSettlementKind
): Promise<{ rate: QrRate | null; settlementHour: number | null }> {
  let settlementHour: number | null = null;
  if (kind === "T1") {
    const cfg = await getSetting("settlement.qr_t1");
    settlementHour = cfg.enabled ? cfg.hour : null;
  }

  const resolved = await resolveUserScheme(userId);
  if (resolved.source === "NONE" || !resolved.schemeId) return { rate: null, settlementHour };

  const slabs = await prisma.mdrSlab.findMany({
    where: { schemeId: resolved.schemeId, serviceKind: "QR", active: true },
    orderBy: { minAmount: "asc" },
  });
  // Prefer a RuPay-pinned slab, else a wildcard-brand slab; take the lowest band
  // as the headline rate (bands rarely differ in % for QR).
  const slab =
    slabs.find((s) => s.brandType && s.brandType.toUpperCase() === QR_BRAND_TYPE) ??
    slabs.find((s) => !s.brandType) ??
    slabs[0];
  if (!slab) return { rate: null, settlementHour };

  const t0 = Number(slab.mdrValueT0) > 0 ? slab.mdrValueT0 : slab.mdrValue;
  const value = Number(kind === "INSTANT" ? t0 : slab.mdrValue);
  return { rate: { type: slab.mdrType, value }, settlementHour };
}

/**
 * The live static QR every retailer collects payments on for the requested
 * settlement stream (?kind=INSTANT|T1 — QR-Instant / QR-T+1), plus remaining
 * headroom and the next QR for overflow (split payments). Each kind rotates
 * independently, so both streams can be live at once.
 *   { qr, overflowQr, kind }                  → collect remaining on `qr`, rest on `overflowQr`
 *   { qr: null, reason: "LIMIT_REACHED" }     → every QR of this kind hit its daily cap; paused
 *   { qr: null, reason: "NOT_CONFIGURED" }    → admin hasn't set one up for this kind yet
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/** Parse ?kind → INSTANT | T1 (defaults to T1, the historical stream). */
function parseKind(req: Request): QrSettlementKind {
  const raw = new URL(req.url).searchParams.get("kind")?.toUpperCase();
  return raw === "INSTANT" ? "INSTANT" : "T1";
}

export async function GET(req: Request) {
  let user;
  try {
    // Only retailers collect on the shop QR — DT/MD/SD/admins have no collect surface.
    user = await requireRole("RETAILER");
    await assertServiceEnabled(SERVICE_KEYS.QR, { name: "QR Payments", userId: user.id, role: user.role });
  } catch (e) {
    return toErrorResponse(e);
  }

  const kind = parseKind(req);
  const [qr, rateInfo] = await Promise.all([resolveLiveQr(kind), qrRateInfo(user.id, kind)]);

  if (!qr) {
    // Is this kind's pool merely exhausted for today, or has nothing been set up?
    const anyEnabled = await prisma.staticQr.count({ where: { enabled: true, settlementKind: kind } });
    return NextResponse.json({
      qr: null,
      overflowQr: null,
      kind,
      rate: rateInfo.rate,
      settlementHour: rateInfo.settlementHour,
      reason: anyEnabled > 0 ? "LIMIT_REACHED" : "NOT_CONFIGURED",
    });
  }

  const used = await collectedToday(qr.id);
  const payload = toRetailerQrPayload(qr, used);

  // Only surface an overflow QR when the live one actually has a daily cap —
  // otherwise there is nothing to "split" onto the next code.
  const hasCap = payload.headroom.dailyLimit != null || payload.headroom.dailyLimitCount != null;
  let overflowQr = null;
  if (hasCap) {
    const next = await peekOverflowQr(qr.id, kind);
    if (next) {
      overflowQr = toRetailerQrPayload(next, await collectedToday(next.id));
    }
  }

  return NextResponse.json({
    qr: payload,
    overflowQr,
    kind,
    rate: rateInfo.rate,
    settlementHour: rateInfo.settlementHour,
  });
}
