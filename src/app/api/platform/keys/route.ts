import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { API_SCOPES, generateApiKeyPair, hashApiSecret, isValidScope } from "@/lib/platform/apiKeys";

/**
 * Partner API key management (Phase 4).
 *   GET  — list own keys (never exposes secrets)
 *   POST — issue a key; the secret is returned ONCE in this response
 *
 * Available to platform tiers (MD/SD) and admins.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PLATFORM_ROLES = new Set(["MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR", "ADMIN", "MASTER_ADMIN"]);

const CreateBody = z.object({
  label: z.string().trim().min(3).max(80),
  scopes: z.array(z.string()).min(1).max(API_SCOPES.length),
  ipAllowlist: z.array(z.string().ip()).max(10).optional(),
}).strict();

function assertPlatformRole(role: string) {
  if (!PLATFORM_ROLES.has(role)) {
    throw Object.assign(new Error("API keys are available to Master/Super Distributors"), { statusCode: 403 });
  }
}

export async function GET() {
  let user;
  try {
    user = await requireAuth();
    assertPlatformRole(user.role);
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return toErrorResponse(e);
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      keyId: true,
      scopes: true,
      ipAllowlist: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ keys, scopes: API_SCOPES });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    assertPlatformRole(user.role);
    await enforceRateLimit(`apikeys:create:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return toErrorResponse(e);
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const scopes = [...new Set(parsed.data.scopes)];
  if (!scopes.every(isValidScope)) {
    return NextResponse.json({ error: "Unknown scope requested" }, { status: 400 });
  }

  const active = await prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= 10) {
    return NextResponse.json({ error: "Key limit reached (10 active). Revoke unused keys first." }, { status: 400 });
  }

  const { keyId, secret } = generateApiKeyPair();
  const created = await prisma.apiKey.create({
    data: {
      userId: user.id,
      label: parsed.data.label,
      keyId,
      secretHash: hashApiSecret(secret),
      scopes,
      ipAllowlist: parsed.data.ipAllowlist ?? [],
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "apikey.created",
      entity: "ApiKey",
      entityId: created.id,
      meta: { keyId, label: parsed.data.label, scopes },
    },
  });

  return NextResponse.json(
    {
      key: {
        id: created.id,
        label: created.label,
        keyId,
        scopes,
        createdAt: created.createdAt,
      },
      // Shown exactly once — we only store the hash.
      secret,
      usage: `Authorization: Bearer ${keyId}.${secret}`,
    },
    { status: 201 }
  );
}
