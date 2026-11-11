import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";
import { dec, toNumber } from "@/lib/money";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pos/machines/:id
 *
 * Machine tracking view — full detail, assignment timeline, and rental
 * subscription history for one terminal.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");

    const machine = await prisma.posMachine.findFirst({
      where: { OR: [{ id: params.id }, { serial: params.id }, { tid: params.id }] },
      include: {
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        assignmentLogs: { orderBy: { createdAt: "desc" }, take: 50 },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: {
            plan: { select: { name: true, monthlyRent: true } },
            user: { select: { name: true, email: true } },
            invoices: { orderBy: { createdAt: "desc" }, take: 12 },
          },
        },
      },
    });
    if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

    // Resolve actor/party names for the timeline in one query.
    const logUserIds = Array.from(
      new Set(
        machine.assignmentLogs
          .flatMap((l) => [l.fromUserId, l.toUserId, l.byUserId])
          .filter((v): v is string => Boolean(v))
      )
    );
    const logUsers = logUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: logUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = (id: string | null) =>
      id ? logUsers.find((u) => u.id === id)?.name ?? id.slice(0, 8) : null;

    return NextResponse.json({
      machine: {
        id: machine.id,
        externalId: machine.externalId,
        source: machine.source,
        serial: machine.serial,
        tid: machine.tid,
        mid: machine.mid,
        model: machine.model,
        brand: machine.brand,
        company: machine.company,
        condition: machine.condition,
        provider: machine.provider,
        status: machine.status,
        location: machine.location,
        city: machine.city,
        state: machine.state,
        assignedUser: machine.assignedUser,
        assignedAt: machine.assignedAt?.toISOString() ?? null,
        createdAt: machine.createdAt.toISOString(),
        syncedAt: machine.syncedAt.toISOString(),
      },
      timeline: machine.assignmentLogs.map((l) => ({
        id: l.id,
        action: l.action,
        from: nameOf(l.fromUserId),
        to: nameOf(l.toUserId),
        by: nameOf(l.byUserId),
        note: l.note,
        at: l.createdAt.toISOString(),
      })),
      subscriptions: machine.subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        billingDay: s.billingDay,
        plan: { name: s.plan.name, monthlyRent: toNumber(dec(s.plan.monthlyRent)) },
        user: s.user,
        startedAt: s.startedAt.toISOString(),
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        invoices: s.invoices.map((i) => ({
          id: i.id,
          periodKey: i.periodKey,
          amount: toNumber(dec(i.amount)),
          status: i.status,
          detail: i.detail,
          createdAt: i.createdAt.toISOString(),
        })),
      })),
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[admin/pos/machines/:id] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const PatchBody = z.object({
  /** Set or clear the per-machine monthly transaction-volume cap (₹). null clears the override. */
  transactionLimit: z.number().positive().nullable(),
});

/**
 * PATCH /api/admin/pos/machines/:id
 *
 * Update the per-machine monthly transaction-volume cap.
 * Accepts `{ transactionLimit: number | null }`.
 * null removes the machine-level override (falls back to user-level or platform default).
 */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "pos.machine.set_limit",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "PosMachine",
      entityId: params.id,
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const machine = await prisma.posMachine.findFirst({
    where: { OR: [{ id: params.id }, { serial: params.id }, { tid: params.id }] },
    select: { id: true, tid: true, serial: true },
  });
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const { transactionLimit } = parsed.data;

  await prisma.posMachine.update({
    where: { id: machine.id },
    data: { transactionLimit: transactionLimit ?? null },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "pos.machine.limit_set",
      entity: "PosMachine",
      entityId: machine.id,
      meta: {
        transactionLimit,
        tid: machine.tid,
        serial: machine.serial,
      },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, transactionLimit });
}
