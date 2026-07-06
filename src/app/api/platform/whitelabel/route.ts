import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";

/**
 * Whitelabel profile management (Phase 4).
 *   GET — own profile (or null)
 *   PUT — create/update; setting status LIVE requires brandName + subdomain
 *
 * Available to platform tiers (MD/SD) and admins.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PLATFORM_ROLES = new Set(["MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR", "ADMIN", "MASTER_ADMIN"]);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "admin", "dashboard", "mail", "cdn", "static", "assets"]);

const Body = z.object({
  brandName: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  faviconUrl: z.string().url().max(500).optional().nullable(),
  primaryColor: z.string().regex(HEX_COLOR).optional(),
  accentColor: z.string().regex(HEX_COLOR).optional(),
  supportEmail: z.string().email().max(120).optional().nullable(),
  supportPhone: z.string().regex(/^\d{10}$/).optional().nullable(),
  subdomain: z.string().trim().toLowerCase().regex(SUBDOMAIN_RE).optional().nullable(),
  customDomain: z.string().trim().toLowerCase().regex(DOMAIN_RE).max(253).optional().nullable(),
  status: z.enum(["DRAFT", "LIVE"]).optional(),
}).strict();

function serialize(p: NonNullable<Awaited<ReturnType<typeof prisma.whitelabelProfile.findUnique>>>) {
  return {
    brandName: p.brandName,
    tagline: p.tagline,
    logoUrl: p.logoUrl,
    faviconUrl: p.faviconUrl,
    primaryColor: p.primaryColor,
    accentColor: p.accentColor,
    supportEmail: p.supportEmail,
    supportPhone: p.supportPhone,
    subdomain: p.subdomain,
    customDomain: p.customDomain,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return toErrorResponse(e);
  }
  if (!PLATFORM_ROLES.has(user.role)) {
    return NextResponse.json({ error: "White-label is available to Master/Super Distributors" }, { status: 403 });
  }

  const profile = await prisma.whitelabelProfile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ profile: profile ? serialize(profile) : null });
}

export async function PUT(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`whitelabel:save:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }
  if (!PLATFORM_ROLES.has(user.role)) {
    return NextResponse.json({ error: "White-label is available to Master/Super Distributors" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  if (body.subdomain && RESERVED_SUBDOMAINS.has(body.subdomain)) {
    return NextResponse.json({ error: `Subdomain "${body.subdomain}" is reserved` }, { status: 400 });
  }
  if (body.status === "LIVE" && !body.subdomain && !body.customDomain) {
    return NextResponse.json({ error: "Going live requires a subdomain or custom domain" }, { status: 400 });
  }

  const existing = await prisma.whitelabelProfile.findUnique({ where: { userId: user.id } });
  // A SUSPENDED profile (admin action) cannot self-serve back to LIVE.
  if (existing?.status === "SUSPENDED" && body.status === "LIVE") {
    return NextResponse.json({ error: "Profile is suspended — contact support" }, { status: 403 });
  }

  const data = {
    brandName: body.brandName,
    tagline: body.tagline ?? null,
    logoUrl: body.logoUrl ?? null,
    faviconUrl: body.faviconUrl ?? null,
    primaryColor: body.primaryColor ?? "#185df5",
    accentColor: body.accentColor ?? "#f97606",
    supportEmail: body.supportEmail ?? null,
    supportPhone: body.supportPhone ?? null,
    subdomain: body.subdomain ?? null,
    customDomain: body.customDomain ?? null,
    ...(body.status && existing?.status !== "SUSPENDED" ? { status: body.status } : {}),
  };

  try {
    const saved = await prisma.whitelabelProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "whitelabel.saved",
        entity: "WhitelabelProfile",
        entityId: saved.id,
        meta: { brandName: saved.brandName, subdomain: saved.subdomain, customDomain: saved.customDomain, status: saved.status },
      },
    });

    return NextResponse.json({ profile: serialize(saved) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That subdomain or domain is already taken" }, { status: 409 });
    }
    return toErrorResponse(e);
  }
}
