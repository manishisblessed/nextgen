import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import {
  createEsignRequest,
  getEsignDetails,
  leegalityConfigured,
} from "@/lib/partners/leegality";

/**
 * Onboarding — partner agreement eSigning via Leegality.
 *
 * POST — create (or replay) the eSign request for this invite; returns the
 *        invitee's signUrl. The workflow profile (LEEGALITY_PROFILE_ID) holds
 *        the agreement template; `irn` is set to the invite id so webhooks
 *        and dashboard entries trace back to the onboarding.
 * GET  — live signing status (verified server-side with Leegality).
 *
 * Persistence: VerificationResult rows (type AGREEMENT_ESIGN, orderid =
 * Leegality documentId) — same audit store the eKYC verifications use.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const TYPE = "AGREEMENT_ESIGN";

async function loadInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return { error: NextResponse.json({ error: "Invalid invite" }, { status: 404 }) };
  if (!["PENDING", "REGISTERED"].includes(invite.status)) {
    return { error: NextResponse.json({ error: "Invite is no longer active" }, { status: 400 }) };
  }
  if (new Date() > invite.expiresAt) {
    return { error: NextResponse.json({ error: "Invite has expired" }, { status: 400 }) };
  }
  return { invite };
}

function guardConfigured(): NextResponse | null {
  if (!flags.esign || !leegalityConfigured()) {
    return NextResponse.json(
      { error: "eSign is not configured. Set PARTNER_ESIGN_ENABLED=true, LEEGALITY_AUTH_TOKEN and LEEGALITY_PROFILE_ID." },
      { status: 503 }
    );
  }
  return null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const loaded = await loadInvite(token);
  if (loaded.error) return loaded.error;
  const invite = loaded.invite;

  const notReady = guardConfigured();
  if (notReady) return notReady;

  // Replay: one active eSign request per invite.
  const existing = await prisma.verificationResult.findFirst({
    where: { inviteId: invite.id, type: TYPE, status: { in: ["Pending", "PartiallySigned", "Completed"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const stored = existing.responsePayload as { invitees?: Array<{ signUrl?: string }> } | null;
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      documentId: existing.orderid,
      status: existing.status,
      signUrl: stored?.invitees?.[0]?.signUrl ?? null,
    });
  }

  const r = await createEsignRequest({
    invitees: [{ name: invite.name ?? invite.phone, email: invite.email, phone: invite.phone }],
    irn: invite.id,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
  }

  await prisma.verificationResult.create({
    data: {
      inviteId: invite.id,
      userId: invite.userId,
      type: TYPE,
      orderid: r.data.documentId,
      status: "Pending",
      requestPayload: { irn: invite.id, role: invite.role } as Prisma.InputJsonValue,
      responsePayload: r.data as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      action: "agreement.esign_requested",
      entity: "Invite",
      entityId: invite.id,
      meta: { documentId: r.data.documentId, provider: "LEEGALITY" },
    },
  });

  return NextResponse.json({
    ok: true,
    documentId: r.data.documentId,
    status: "Pending",
    signUrl: r.data.invitees[0]?.signUrl ?? null,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });

  const configured = flags.esign && leegalityConfigured();
  const record = await prisma.verificationResult.findFirst({
    where: { inviteId: invite.id, type: TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return NextResponse.json({ sent: false, status: null, configured });

  if (!configured) {
    // Provider unreachable/unconfigured — return the last known state.
    return NextResponse.json({ sent: true, configured, documentId: record.orderid, status: record.status, stale: true });
  }

  const r = await getEsignDetails(record.orderid);
  if (!r.ok) {
    return NextResponse.json({ sent: true, configured, documentId: record.orderid, status: record.status, stale: true });
  }

  const statusLabel =
    r.data.status === "COMPLETED" ? "Completed"
    : r.data.status === "PARTIALLY_SIGNED" ? "PartiallySigned"
    : r.data.status === "EXPIRED" ? "Expired"
    : r.data.status === "DELETED" ? "Deleted"
    : "Pending";

  if (statusLabel !== record.status) {
    await prisma.verificationResult.update({
      where: { id: record.id },
      data: { status: statusLabel, responsePayload: r.data as unknown as Prisma.InputJsonValue },
    });
    if (statusLabel === "Completed") {
      await prisma.auditLog.create({
        data: {
          action: "agreement.esign_completed",
          entity: "Invite",
          entityId: invite.id,
          meta: { documentId: record.orderid, provider: "LEEGALITY" },
        },
      });
    }
  }

  const stored = record.responsePayload as { invitees?: Array<{ signUrl?: string }> } | null;
  return NextResponse.json({
    sent: true,
    configured,
    documentId: record.orderid,
    status: statusLabel,
    completed: r.data.completed,
    signUrl: r.data.invitees.find((i) => !i.signed)?.signUrl ?? stored?.invitees?.[0]?.signUrl ?? null,
  });
}
