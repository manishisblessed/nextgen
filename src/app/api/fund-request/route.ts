import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { isAdminRole } from "@/lib/security/ownership";
import { assertKycCurrent, ReKycRequiredError } from "@/lib/security/kycGate";
import { assertLivenessReady, LivenessRequiredError } from "@/lib/security/livenessGate";
import { toNumber } from "@/lib/money";
import { withIdempotency, IdempotencyInProgressError } from "@/lib/idempotency";
import { requireSubmitNonce, SubmitNonceError } from "@/lib/security/submitNonce";

const CreateBody = z
  .object({
    amount: z.number().positive().max(500000),
    mode: z.string().min(2),
    utr: z.string().optional(),
    bankName: z.string().optional(),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  let where: Record<string, unknown>;
  if (isAdminRole(user.role)) {
    // MASTER_ADMIN / ADMIN / SUPPORT see all fund requests.
    where = {};
  } else if (user.role === "RETAILER") {
    where = { requesterId: user.id };
  } else {
    where = {
      OR: [
        { requesterId: user.id },
        { requester: { parentId: user.id } },
      ],
    };
  }

  const requests = await prisma.fundRequest.findMany({
    where,
    include: {
      requester: {
        select: { id: true, name: true, email: true, phone: true },
      },
      approver: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      mode: r.mode,
      utr: r.utr,
      bankName: r.bankName,
      status: r.status,
      remarks: r.remarks,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rejectedAt: r.rejectedAt?.toISOString() ?? null,
      requester: r.requester,
      approver: r.approver,
    })),
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    // Onboarding liveness gate — network users must have a face baseline first.
    await assertLivenessReady(user);
    // Monthly Re-KYC gate — network users must re-verify before transacting.
    await assertKycCurrent(user);
    await enforceRateLimit(`fund-request:create:${user.id}`, RATE_LIMITS.fundRequestCreate);
    // Single-use submit nonce (replay defense for the web form). Bearer/mobile
    // callers are exempt and rely on Idempotency-Key instead.
    await requireSubmitNonce(req, user.id);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof LivenessRequiredError)
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    if (e instanceof ReKycRequiredError)
      return NextResponse.json({ error: e.message, code: e.code, reKycDueAt: e.dueAt }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json(
        { error: e.message, retryAfterSec: e.result.retryAfterSec },
        { status: 429 }
      );
    if (e instanceof SubmitNonceError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Idempotency-Key dedupes accidental/replayed submits; a replay returns the
  // original created request instead of inserting a duplicate.
  const idemKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || nanoid();

  try {
    const result = await withIdempotency(
      { key: idemKey, scope: "fund-request.create", userId: user.id },
      async () => {
        const requester = await prisma.user.findUnique({
          where: { id: user.id },
          select: { parentId: true },
        });

        const created = await prisma.fundRequest.create({
          data: {
            requesterId: user.id,
            approverId: requester?.parentId ?? null,
            amount: parsed.data.amount,
            mode: parsed.data.mode,
            utr: parsed.data.utr ?? null,
            bankName: parsed.data.bankName ?? null,
          },
          include: {
            requester: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "fund_request.created",
            entity: "FundRequest",
            entityId: created.id,
            meta: {
              amount: toNumber(created.amount),
              mode: created.mode,
              approverId: created.approverId,
            },
          },
        });

        return {
          id: created.id,
          amount: Number(created.amount),
          mode: created.mode,
          utr: created.utr,
          bankName: created.bankName,
          status: created.status,
          remarks: created.remarks,
          createdAt: created.createdAt.toISOString(),
          approvedAt: null,
          rejectedAt: null,
          requester: created.requester,
          approver: null,
        };
      }
    );

    return NextResponse.json({ request: result }, { status: 201 });
  } catch (e) {
    if (e instanceof IdempotencyInProgressError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
}
