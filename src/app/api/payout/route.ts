import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { holdFunds, getBalances, LedgerError } from "@/lib/ledger";
import { toNumber } from "@/lib/money";
import { encryptField } from "@/lib/crypto/fieldEncryption";
import { scopeUserIdFilter } from "@/lib/security/ownership";
import { assertKycCurrent, ReKycRequiredError } from "@/lib/security/kycGate";
import { assertLivenessReady, LivenessRequiredError } from "@/lib/security/livenessGate";
import { assertAccountActive, AccountSuspendedError } from "@/lib/security/accountGate";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { withIdempotency, IdempotencyInProgressError } from "@/lib/idempotency";
import { requireSubmitNonce, SubmitNonceError } from "@/lib/security/submitNonce";
import { requireTxnPin, TxnPinError } from "@/lib/security/txnPin";
import { assertTransactionRisk, RiskError } from "@/lib/risk/engine";
import { clientIp } from "@/lib/security/audit";
import { quotePayoutForUser } from "@/lib/payout/charges";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { requireActiveScheme, NoSchemeError } from "@/lib/scheme/gate";
import { getSchemeLimit, PAYOUT_MODE_SERVICE } from "@/lib/scheme/resolver";
import { dec, gt } from "@/lib/money";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const VPA_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

const CreateBody = z
  .object({
    mode: z.enum(["IMPS", "NEFT", "RTGS", "UPI"]),
    amount: z.number().positive().max(500000),
    beneficiaryName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().optional(),
    confirmAccountNumber: z.string().trim().optional(),
    ifsc: z.string().trim().toUpperCase().optional(),
    vpa: z.string().trim().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "UPI") {
      if (!v.vpa || !VPA_RE.test(v.vpa)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vpa"], message: "Valid UPI ID required" });
      }
    } else {
      if (!v.accountNumber || !ACCOUNT_RE.test(v.accountNumber)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountNumber"], message: "Account number must be 9-18 digits" });
      }
      if (v.confirmAccountNumber !== undefined && v.confirmAccountNumber !== v.accountNumber) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmAccountNumber"], message: "Account numbers do not match" });
      }
      if (!v.ifsc || !IFSC_RE.test(v.ifsc)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ifsc"], message: "Invalid IFSC code" });
      }
    }
  });

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const where = await scopeUserIdFilter(user);
  const [rows, balances] = await Promise.all([
    prisma.payoutRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
    getBalances(user.id),
  ]);

  return NextResponse.json({
    balances: {
      walletBalance: toNumber(balances.walletBalance),
      heldBalance: toNumber(balances.heldBalance),
      spendable: toNumber(balances.spendable),
    },
    payouts: rows.map((r) => ({
      id: r.id,
      beneficiaryName: r.beneficiaryName,
      accountLast4: r.accountLast4,
      mode: r.mode,
      amount: toNumber(r.amount),
      serviceCharge: toNumber(r.serviceCharge),
      gst: toNumber(r.gst),
      totalDebit: toNumber(r.totalDebit),
      status: r.status,
      utr: r.utr,
      failureReason: r.failureReason,
      remarks: r.remarks,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      user: r.user,
    })),
  });
}

export async function POST(req: Request) {
  if (!flags.payout) {
    return NextResponse.json({ error: "Payout service is currently disabled" }, { status: 503 });
  }

  let user;
  try {
    user = await requireAuth();
    // Suspension gate — a SUSPENDED account (admin/distributor action) cannot
    // create payouts, regardless of what its session token says.
    await assertAccountActive(user.id);
    // Onboarding liveness gate — network users must have a face baseline first.
    await assertLivenessReady(user);
    // Monthly Re-KYC gate — network users must re-verify before transacting.
    await assertKycCurrent(user);
    // Runtime admin kill-switch (On/Off Services panel) — hard-gates the rail.
    await assertServiceEnabled(SERVICE_KEYS.PAYOUT, { name: "Payout", userId: user.id, role: user.role });
    // Scheme gate — network users may only transact once a scheme is assigned.
    await requireActiveScheme(user.id);
    await enforceRateLimit(`payout:create:${user.id}`, RATE_LIMITS.payoutCreate);
    // Single-use submit nonce (replay defense for the web form). Bearer/mobile
    // callers are exempt and rely on Idempotency-Key instead.
    await requireSubmitNonce(req, user.id);
    // Transaction PIN — required on every money-moving action (x-txn-pin header).
    await requireTxnPin(user, req, { action: "payout.create", ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  } catch (e) {
    if (e instanceof TxnPinError)
      return NextResponse.json({ error: e.message, txnPin: true, code: e.code }, { status: e.statusCode });
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof AccountSuspendedError)
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    if (e instanceof LivenessRequiredError)
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    if (e instanceof ReKycRequiredError)
      return NextResponse.json({ error: e.message, code: e.code, reKycDueAt: e.dueAt }, { status: e.statusCode });
    if (e instanceof ServiceDisabledError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof NoSchemeError)
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    if (e instanceof SubmitNonceError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const payoutService = PAYOUT_MODE_SERVICE[body.mode];
  if (payoutService) {
    const limit = await getSchemeLimit(user.id, payoutService);
    if (limit && gt(dec(body.amount), limit)) {
      return NextResponse.json(
        { error: `Amount exceeds the maximum allowed limit of ₹${limit.toNumber().toLocaleString("en-IN")}` },
        { status: 400 }
      );
    }
  }

  const quote = await quotePayoutForUser(user.id, body.amount, body.mode);

  // Risk rules: rolling daily/night caps, hourly velocity, and the
  // new-beneficiary cooling cap (mule defense). Evaluated on the full debit.
  try {
    const handleForRisk = body.mode === "UPI" ? body.vpa! : body.accountNumber!;
    await assertTransactionRisk({
      userId: user.id,
      service: "PAYOUT",
      amount: quote.totalDebit,
      beneficiary: {
        accountLast4: handleForRisk.replace(/@.*/, "").slice(-4),
        mode: body.mode,
      },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (e) {
    if (e instanceof RiskError)
      return NextResponse.json(
        { error: e.message, code: e.code, rule: e.rule },
        { status: e.statusCode }
      );
    throw e;
  }

  // Idempotency-Key header dedupes accidental double submits (client retries).
  const idemKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || nanoid();

  try {
    const result = await withIdempotency(
      { key: idemKey, scope: "payout.create", userId: user.id },
      async () => {
        const isUpi = body.mode === "UPI";
        const handle = isUpi ? body.vpa! : body.accountNumber!;
        const accountLast4 = handle.replace(/@.*/, "").slice(-4);
        const bulkpeReferenceId = `PO${nanoid(18).toUpperCase()}`;

        const created = await prisma.$transaction(async (tx) => {
          // Reserve totalDebit from spendable — throws INSUFFICIENT_FUNDS if short.
          await holdFunds({ userId: user.id, amount: quote.totalDebit }, tx);

          return tx.payoutRequest.create({
            data: {
              userId: user.id,
              makerId: user.id,
              beneficiaryName: body.beneficiaryName,
              accountNumber: encryptField(handle),
              ifsc: !isUpi && body.ifsc ? encryptField(body.ifsc) : null,
              accountLast4,
              mode: body.mode,
              amount: quote.amount,
              serviceCharge: quote.serviceCharge,
              gst: quote.gst,
              totalDebit: quote.totalDebit,
              status: "PENDING_APPROVAL",
              bulkpeReferenceId,
            },
          });
        });

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "payout.submitted",
            entity: "PayoutRequest",
            entityId: created.id,
            meta: {
              mode: created.mode,
              amount: toNumber(created.amount),
              totalDebit: toNumber(created.totalDebit),
              accountLast4: created.accountLast4,
            },
          },
        });

        return {
          id: created.id,
          mode: created.mode,
          beneficiaryName: created.beneficiaryName,
          accountLast4: created.accountLast4,
          amount: toNumber(created.amount),
          serviceCharge: toNumber(created.serviceCharge),
          gst: toNumber(created.gst),
          totalDebit: toNumber(created.totalDebit),
          status: created.status,
          createdAt: created.createdAt.toISOString(),
        };
      }
    );

    return NextResponse.json({ payout: result }, { status: 201 });
  } catch (e) {
    if (e instanceof IdempotencyInProgressError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_FUNDS")
      return NextResponse.json({ error: "Insufficient spendable balance for this payout" }, { status: 400 });
    throw e;
  }
}
