import { nanoid } from "nanoid";
import type { Dispute, DisputeCategory, DisputePriority, DisputeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendOpsAlert } from "@/lib/monitoring/alerts";

/**
 * Dispute / support-ticket workflow (Phase 3 — agent experience).
 *
 * SLA model: every ticket gets a due-time from its priority. A worker sweep
 * (QUEUES.DISPUTE_SLA) stamps breaches exactly once, escalates the priority
 * one level, and alerts ops. The clock pauses while AWAITING_USER (we only
 * sweep OPEN / UNDER_REVIEW) and re-bases when the user replies.
 */

export class DisputeError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = "DISPUTE_ERROR"
  ) {
    super(message);
  }
}

/** Support response SLA per priority, in hours. */
export const SLA_HOURS: Record<DisputePriority, number> = {
  URGENT: 4,
  HIGH: 24,
  NORMAL: 48,
  LOW: 72,
};

const ESCALATION: Record<DisputePriority, DisputePriority> = {
  LOW: "NORMAL",
  NORMAL: "HIGH",
  HIGH: "URGENT",
  URGENT: "URGENT",
};

/** Statuses where support still owes the user a response (SLA clock runs). */
export const SLA_ACTIVE_STATUSES: DisputeStatus[] = ["OPEN", "UNDER_REVIEW"];

export function computeSlaDueAt(priority: DisputePriority, from: Date = new Date()): Date {
  return new Date(from.getTime() + SLA_HOURS[priority] * 3600_000);
}

export function escalate(priority: DisputePriority): DisputePriority {
  return ESCALATION[priority];
}

export async function createDispute(input: {
  userId: string;
  category: DisputeCategory;
  priority?: DisputePriority;
  subject: string;
  description: string;
  txnRefId?: string;
}): Promise<Dispute> {
  // A linked transaction must exist and belong to the reporter — prevents
  // fishing for other users' refIds through support.
  if (input.txnRefId) {
    const txn = await prisma.transaction.findUnique({ where: { refId: input.txnRefId } });
    if (!txn || txn.userId !== input.userId) {
      throw new DisputeError("Transaction reference not found in your account", 404, "TXN_NOT_FOUND");
    }
  }

  const priority = input.priority ?? "NORMAL";
  const dispute = await prisma.dispute.create({
    data: {
      ticketNo: `DSP${nanoid(8).toUpperCase()}`,
      userId: input.userId,
      category: input.category,
      priority,
      subject: input.subject,
      description: input.description,
      txnRefId: input.txnRefId,
      slaDueAt: computeSlaDueAt(priority),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: "dispute.created",
      entity: "Dispute",
      entityId: dispute.id,
      meta: { ticketNo: dispute.ticketNo, category: input.category, priority, txnRefId: input.txnRefId ?? null },
    },
  });

  return dispute;
}

/**
 * Append a message to the thread and advance the workflow:
 *  - first support reply stamps firstResponseAt and moves OPEN → UNDER_REVIEW
 *  - a user reply on AWAITING_USER restarts the SLA clock (UNDER_REVIEW)
 *  - a user reply on RESOLVED/REJECTED reopens the ticket with a fresh SLA
 */
export async function addDisputeMessage(input: {
  disputeId: string;
  authorId: string;
  fromSupport: boolean;
  body: string;
}) {
  const dispute = await prisma.dispute.findUnique({ where: { id: input.disputeId } });
  if (!dispute) throw new DisputeError("Dispute not found", 404, "NOT_FOUND");

  const now = new Date();
  const data: {
    status?: DisputeStatus;
    firstResponseAt?: Date;
    slaDueAt?: Date;
    slaBreachedAt?: null;
    reopenCount?: { increment: number };
    resolvedAt?: null;
    resolvedById?: null;
    resolution?: null;
  } = {};

  if (input.fromSupport) {
    if (!dispute.firstResponseAt) data.firstResponseAt = now;
    if (dispute.status === "OPEN") data.status = "UNDER_REVIEW";
  } else {
    if (dispute.status === "AWAITING_USER") {
      data.status = "UNDER_REVIEW";
      data.slaDueAt = computeSlaDueAt(dispute.priority, now);
      data.slaBreachedAt = null;
    } else if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {
      data.status = "UNDER_REVIEW";
      data.reopenCount = { increment: 1 };
      data.slaDueAt = computeSlaDueAt(dispute.priority, now);
      data.slaBreachedAt = null;
      data.resolvedAt = null;
      data.resolvedById = null;
      data.resolution = null;
    }
  }

  const [message] = await prisma.$transaction([
    prisma.disputeMessage.create({
      data: {
        disputeId: dispute.id,
        authorId: input.authorId,
        fromSupport: input.fromSupport,
        body: input.body,
      },
    }),
    prisma.dispute.update({ where: { id: dispute.id }, data }),
  ]);

  // Notify the counterparty in-app (best-effort; never blocks the reply).
  try {
    if (input.fromSupport) {
      await prisma.notification.create({
        data: {
          userId: dispute.userId,
          title: `Support replied on ${dispute.ticketNo}`,
          body: input.body.slice(0, 200),
          channel: "INAPP",
        },
      });
    }
  } catch {
    /* non-critical */
  }

  return message;
}

/** Support action: mark a ticket waiting on the user (pauses the SLA clock). */
export async function markAwaitingUser(disputeId: string, adminId: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw new DisputeError("Dispute not found", 404, "NOT_FOUND");
  if (!SLA_ACTIVE_STATUSES.includes(dispute.status)) {
    throw new DisputeError(`Cannot mark a ${dispute.status} ticket as awaiting user`, 409, "BAD_STATE");
  }
  return prisma.dispute.update({
    where: { id: disputeId },
    data: { status: "AWAITING_USER", firstResponseAt: dispute.firstResponseAt ?? new Date() },
  });
}

export async function resolveDispute(input: {
  disputeId: string;
  adminId: string;
  outcome: "RESOLVED" | "REJECTED";
  resolution: string;
}) {
  const dispute = await prisma.dispute.findUnique({ where: { id: input.disputeId } });
  if (!dispute) throw new DisputeError("Dispute not found", 404, "NOT_FOUND");
  if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {
    throw new DisputeError("Dispute is already closed", 409, "ALREADY_CLOSED");
  }

  const now = new Date();
  const updated = await prisma.dispute.update({
    where: { id: input.disputeId },
    data: {
      status: input.outcome,
      resolvedAt: now,
      resolvedById: input.adminId,
      resolution: input.resolution,
      firstResponseAt: dispute.firstResponseAt ?? now,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: input.adminId,
      action: input.outcome === "RESOLVED" ? "dispute.resolved" : "dispute.rejected",
      entity: "Dispute",
      entityId: dispute.id,
      meta: { ticketNo: dispute.ticketNo, outcome: input.outcome },
    },
  });

  try {
    await prisma.notification.create({
      data: {
        userId: dispute.userId,
        title: `Ticket ${dispute.ticketNo} ${input.outcome === "RESOLVED" ? "resolved" : "closed"}`,
        body: input.resolution.slice(0, 200),
        channel: "INAPP",
      },
    });
  } catch {
    /* non-critical */
  }

  return updated;
}

/**
 * Worker sweep: stamp SLA breaches exactly once, escalate priority one level,
 * and alert ops. Runs every 30 minutes (QUEUES.DISPUTE_SLA); idempotent —
 * already-stamped rows are excluded by the slaBreachedAt filter.
 */
export async function sweepDisputeSlas(now: Date = new Date()): Promise<{ breached: number }> {
  const overdue = await prisma.dispute.findMany({
    where: {
      status: { in: SLA_ACTIVE_STATUSES },
      slaDueAt: { lt: now },
      slaBreachedAt: null,
    },
    take: 200,
  });

  for (const d of overdue) {
    await prisma.dispute.update({
      where: { id: d.id },
      data: { slaBreachedAt: now, priority: escalate(d.priority) },
    });
    await sendOpsAlert({
      title: "Dispute SLA breached",
      severity: d.priority === "URGENT" || d.priority === "HIGH" ? "critical" : "warning",
      details: {
        ticket: d.ticketNo,
        category: d.category,
        priority: `${d.priority} → ${escalate(d.priority)}`,
        ageHours: Math.round((now.getTime() - d.createdAt.getTime()) / 3600_000),
      },
    });
  }

  return { breached: overdue.length };
}
