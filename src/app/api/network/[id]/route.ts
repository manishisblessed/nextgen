import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { bumpTokenVersion } from "@/lib/security/session";
import { toErrorResponse } from "@/lib/security/apiErrors";

/**
 * Network security switch: lets a distributor-tier parent suspend or
 * reactivate an account DIRECTLY under them (retailer under distributor,
 * distributor under master-distributor, ...). Suspension freezes all new
 * money movement immediately (see assertAccountActive in runTransaction)
 * and kills the target's live sessions.
 *
 * Guardrails:
 *  - strictly parent → direct child (never self, never deeper tiers)
 *  - an account suspended by an admin (fraud/AML desk) cannot be
 *    reactivated by its distributor — only an admin can lift that
 *  - reactivation restores the pre-suspension status (a PENDING_KYC user
 *    does not get promoted to ACTIVE by a suspend/activate round-trip)
 */

const Body = z.object({
  action: z.enum(["suspend", "activate"]),
  reason: z.string().trim().max(500).optional(),
}).strict();

const NETWORK_PARENT_ROLES = ["DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"];
const ADMIN_ROLES = ["ADMIN", "MASTER_ADMIN"];

const SUSPEND_ACTIONS = ["network.user.suspend", "user.suspend"];

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();

    if (![...NETWORK_PARENT_ROLES, ...ADMIN_ROLES].includes(user.role)) {
      return NextResponse.json(
        { error: "You cannot manage network accounts" },
        { status: 403 }
      );
    }

    await enforceRateLimit(`network:status:${user.id}`, RATE_LIMITS.sensitiveWrite);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { action, reason } = parsed.data;

    if (action === "suspend" && !reason) {
      return NextResponse.json(
        { error: "A reason is required to suspend an account" },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, status: true, parentId: true, name: true },
    });
    if (!target)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Ownership: strictly the direct parent (admins use /api/admin/users/[id]).
    if (target.parentId !== user.id) {
      return NextResponse.json(
        { error: "This account is not directly under your network" },
        { status: 403 }
      );
    }

    if (target.status === "CLOSED") {
      return NextResponse.json(
        { error: "This account is closed and cannot be changed" },
        { status: 409 }
      );
    }

    if (action === "suspend") {
      if (target.status === "SUSPENDED") {
        return NextResponse.json({ ok: true, status: "SUSPENDED" });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: target.id },
          data: { status: "SUSPENDED" },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "network.user.suspend",
            entity: "User",
            entityId: target.id,
            meta: {
              reason,
              previousStatus: target.status,
              actorRole: user.role,
            },
            ip: clientIp(req),
          },
        }),
      ]);

      // Kill the target's live sessions so the freeze is immediate.
      await bumpTokenVersion(target.id, { swallow: true });

      return NextResponse.json({ ok: true, status: "SUSPENDED" });
    }

    // action === "activate"
    if (target.status !== "SUSPENDED") {
      return NextResponse.json({ ok: true, status: target.status });
    }

    // Who suspended this account last? A distributor may only lift a
    // suspension placed by the network (their own), never one placed by
    // the admin/AML desk.
    const lastSuspension = await prisma.auditLog.findFirst({
      where: { action: { in: SUSPEND_ACTIONS }, entityId: target.id },
      orderBy: { createdAt: "desc" },
      select: { action: true, userId: true, meta: true },
    });

    if (lastSuspension?.action === "user.suspend") {
      return NextResponse.json(
        { error: "This account was suspended by the platform. Contact support to reactivate it." },
        { status: 403 }
      );
    }

    // Restore the pre-suspension status (never promote PENDING_KYC to ACTIVE).
    const meta = (lastSuspension?.meta ?? {}) as { previousStatus?: string };
    const restored = meta.previousStatus === "PENDING_KYC" ? "PENDING_KYC" : "ACTIVE";

    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { status: restored },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "network.user.activate",
          entity: "User",
          entityId: target.id,
          meta: { reason, restoredStatus: restored, actorRole: user.role },
          ip: clientIp(req),
        },
      }),
    ]);

    await bumpTokenVersion(target.id, { swallow: true });

    return NextResponse.json({ ok: true, status: restored });
  } catch (e) {
    return toErrorResponse(e);
  }
}
