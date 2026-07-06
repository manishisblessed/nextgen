import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { encryptField } from "@/lib/crypto/fieldEncryption";
import { WEBHOOK_EVENTS, isValidEvent } from "@/lib/platform/webhooks";

/**
 * Outbound webhook endpoint management (Phase 4).
 *   GET    — list endpoints + last 50 deliveries
 *   POST   — register an endpoint; the signing secret is returned ONCE
 *   PATCH  — update events / toggle active
 *   DELETE — remove an endpoint (?id=)
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PLATFORM_ROLES = new Set(["MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR", "ADMIN", "MASTER_ADMIN"]);

const CreateBody = z.object({
  url: z.string().url().max(500).refine((u) => u.startsWith("https://"), "Webhook URLs must use HTTPS"),
  events: z.array(z.string()).min(1),
}).strict();

const PatchBody = z.object({
  id: z.string().min(1),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
}).strict();

async function requirePlatformUser() {
  const user = await requireAuth();
  if (!PLATFORM_ROLES.has(user.role)) {
    const err = new Error("Webhooks are available to Master/Super Distributors");
    throw Object.assign(err, { forbidden: true });
  }
  return user;
}

function handleAuthError(e: unknown) {
  if ((e as { forbidden?: boolean }).forbidden) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  return toErrorResponse(e);
}

export async function GET() {
  let user;
  try {
    user = await requirePlatformUser();
  } catch (e) {
    return handleAuthError(e);
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });

  const deliveries = endpoints.length
    ? await prisma.webhookDelivery.findMany({
        where: { endpointId: { in: endpoints.map((e) => e.id) } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          endpointId: true,
          event: true,
          status: true,
          attempts: true,
          responseCode: true,
          lastError: true,
          deliveredAt: true,
          createdAt: true,
        },
      })
    : [];

  return NextResponse.json({ endpoints, deliveries, events: WEBHOOK_EVENTS });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requirePlatformUser();
    await enforceRateLimit(`webhooks:create:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return handleAuthError(e);
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const events = [...new Set(parsed.data.events)];
  if (!events.every(isValidEvent)) {
    return NextResponse.json({ error: "Unknown event in subscription list" }, { status: 400 });
  }

  const count = await prisma.webhookEndpoint.count({ where: { userId: user.id } });
  if (count >= 5) {
    return NextResponse.json({ error: "Endpoint limit reached (5). Remove one first." }, { status: 400 });
  }

  // We generate the signing secret — partners verify X-NGP-Signature with it.
  const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;

  const created = await prisma.webhookEndpoint.create({
    data: {
      userId: user.id,
      url: parsed.data.url,
      secret: encryptField(secret),
      events,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "webhook.endpoint_created",
      entity: "WebhookEndpoint",
      entityId: created.id,
      meta: { url: parsed.data.url, events },
    },
  });

  return NextResponse.json(
    {
      endpoint: { id: created.id, url: created.url, events, active: true, createdAt: created.createdAt },
      // Shown once; store it server-side to verify our signatures.
      secret,
    },
    { status: 201 }
  );
}

export async function PATCH(req: Request) {
  let user;
  try {
    user = await requirePlatformUser();
    await enforceRateLimit(`webhooks:update:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return handleAuthError(e);
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.webhookEndpoint.findUnique({ where: { id: parsed.data.id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  const events = parsed.data.events ? [...new Set(parsed.data.events)] : undefined;
  if (events && !events.every(isValidEvent)) {
    return NextResponse.json({ error: "Unknown event in subscription list" }, { status: 400 });
  }

  const updated = await prisma.webhookEndpoint.update({
    where: { id: existing.id },
    data: {
      ...(events ? { events } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });

  return NextResponse.json({ endpoint: updated });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requirePlatformUser();
  } catch (e) {
    return handleAuthError(e);
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  await prisma.webhookEndpoint.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "webhook.endpoint_deleted",
      entity: "WebhookEndpoint",
      entityId: id,
      meta: { url: existing.url },
    },
  });

  return NextResponse.json({ ok: true });
}
