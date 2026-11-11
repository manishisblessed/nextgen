import { type ServiceCode, type TxnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";
import { rechargekitStatus } from "@/lib/partners/sameday-rechargekit";
import {
  finalizeServiceTransaction,
  correctTerminalToSuccess,
  FINALIZABLE_TXN_SELECT,
} from "@/lib/services/finalize";
import { deriveTxnRefs } from "./refs";

/**
 * Targeted, provider-VERIFIED reconciliation of a SINGLE transaction — the
 * engine behind the admin "Resolve / verify with provider" action.
 *
 * It never flips money on an admin's say-so: it re-checks the provider's own
 * status API first (by any stored ref, plus an optional admin-supplied pay-step
 * ref recovered from the provider panel). Then:
 *   - a NON-TERMINAL (NEEDS_REVIEW/PROCESSING) row settles or refunds via the
 *     shared finalizer,
 *   - an already-TERMINAL FAILED/REFUNDED row that the provider confirms SUCCESS
 *     is promoted via the corrective finalizer, with a LIEN clawback of any
 *     earlier refund (never a negative wallet).
 *
 * Note (NEXTGEN-specific): NEXTGEN's BbpsProvider.status() only accepts
 * `{ orderId?, requestId? }` — there is no `billFetchRef` named parameter.
 * billFetchRef strings from deriveTxnRefs are iterated and tried as orderId /
 * requestId values; sameday-bbps.ts internally uses prefix detection ("SDS"
 * prefix → request_id, else → order_id) so they still resolve correctly.
 */

const BBPS_SERVICES: ServiceCode[] = [
  "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
  "BILL_CREDIT_CARD", "BILL_EDUCATION", "BILL_INSURANCE",
  "RECHARGE_BROADBAND",
];

type Rail = "bbps" | "rechargekit";
type ProviderStatus = "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED";

function railFor(partner: string | null, service: ServiceCode): Rail | null {
  if (partner === "SAMEDAY_RECHARGEKIT") return "rechargekit";
  if ((partner === "SAMEDAY_PAY2NEW" || partner === null) && BBPS_SERVICES.includes(service))
    return "bbps";
  return null;
}

/** Try every candidate ref against the rail's status API; first hit wins. */
async function resolveProviderStatus(
  rail: Rail,
  refs: string[]
): Promise<{
  status: ProviderStatus;
  matchedRef: string;
  payRef: string | null;
  amount: number | null;
  raw: unknown;
} | null> {
  if (rail === "rechargekit") {
    for (const ref of refs) {
      let r = await rechargekitStatus({ txnId: ref });
      if (!r.ok) r = await rechargekitStatus({ requestId: ref });
      if (r.ok)
        return {
          status: r.data.status,
          matchedRef: ref,
          payRef: r.data.txnId || r.data.requestId || null,
          amount: typeof r.data.amount === "number" && r.data.amount > 0 ? r.data.amount : null,
          raw: r.raw,
        };
    }
    return null;
  }

  // BBPS — NEXTGEN's BbpsProvider.status() does NOT expose a billFetchRef param.
  // We try each candidate as orderId first (sameday-bbps internally routes by
  // prefix: SDS → request_id, else → order_id), then as requestId as a fallback.
  const bbps = getPartner("bbps");
  if (!bbps.status) return null;
  for (const ref of refs) {
    let r = await bbps.status({ orderId: ref });
    if (!r.ok) r = await bbps.status({ requestId: ref });
    if (r.ok)
      return {
        status: r.data.status,
        matchedRef: ref,
        // NEXTGEN's BbpsProvider.status() result type does not expose orderId/requestId.
        // We record the matched candidate ref as the payRef instead.
        payRef: ref,
        amount: typeof r.data.amount === "number" && r.data.amount > 0 ? r.data.amount : null,
        raw: r.raw,
      };
  }
  return null;
}

/** True when the provider-reported amount matches the row (or is unknown). */
function providerAmountMatches(providerAmount: number | null, rowAmount: number): boolean {
  if (providerAmount == null) return true;
  return Math.abs(providerAmount - rowAmount) <= 0.01;
}

export type CorrectOneResult =
  | { found: false }
  | {
      found: true;
      refId: string;
      rail: Rail;
      status: TxnStatus;
      providerStatus: ProviderStatus | "UNRESOLVED" | "NOT_POLLED";
      outcome:
        | "corrected"    // FAILED/REFUNDED → SUCCESS (clawback if a refund existed)
        | "settled"      // non-terminal → SUCCESS
        | "refunded"     // non-terminal → FAILED/REFUNDED (reserve returned)
        | "noop"         // already consistent with the provider
        | "unresolved"   // provider couldn't confirm from any ref
        | "amount_mismatch" // provider SUCCESS but a DIFFERENT amount (twin attempt)
        | "not_applicable"; // rail has no status API / unsupported service
      providerAmount?: number;
      clawback?: { placed: boolean; refunded: number; lienId: string | null };
    };

export async function correctOneTransaction(
  ref: string,
  opts: {
    actorId: string;
    providerRef?: string;
    source?: string;
    remarks?: string;
    forceRefundNotFound?: boolean;
  }
): Promise<CorrectOneResult> {
  const txn = await prisma.transaction.findFirst({
    where: { OR: [{ refId: ref }, { partnerTxnId: ref }] },
    select: { ...FINALIZABLE_TXN_SELECT, request: true, response: true },
  });
  if (!txn) return { found: false };

  const rail = railFor(txn.partner, txn.service);
  if (!rail) {
    return {
      found: true,
      refId: txn.refId,
      rail: "bbps",
      status: txn.status,
      providerStatus: "NOT_POLLED",
      outcome: "not_applicable",
    };
  }

  const refs = Array.from(
    new Set(
      [
        opts.providerRef,
        ...deriveTxnRefs({
          partnerTxnId: txn.partnerTxnId,
          request: txn.request,
          response: txn.response,
        }),
      ].filter(Boolean) as string[]
    )
  );
  const resolved = await resolveProviderStatus(rail, refs);
  const source = opts.source ?? "admin_resolve";
  const isTerminalFailed = txn.status === "FAILED" || txn.status === "REFUNDED";

  if (!resolved) {
    // When the admin has confirmed the transaction does not exist in the
    // provider panel AND the status API agrees (UNRESOLVED for every candidate
    // ref), it is safe to refund the held reserve.
    if (opts.forceRefundNotFound && !isTerminalFailed) {
      const res = await finalizeServiceTransaction({
        txn,
        status: "FAILED",
        errorCode: "PROVIDER_NOT_FOUND",
        errorMessage: "Provider has no record of this payment — refunded by admin after verification",
        source: `${source}_not_found`,
        // No cooling-off period in NEXTGEN — refund is applied immediately
      });
      if (res.finalized) {
        await prisma.auditLog.create({
          data: {
            userId: opts.actorId,
            action: "txn.resolve.force_refund_not_found",
            entity: "Transaction",
            entityId: txn.id,
            meta: {
              refId: txn.refId,
              source,
              candidates: refs,
              note: "Provider returned UNRESOLVED for all refs — admin confirmed not in panel",
            },
          },
        });
      }
      return {
        found: true,
        refId: txn.refId,
        rail,
        status: txn.status,
        providerStatus: "UNRESOLVED",
        outcome: res.finalized ? "refunded" : "noop",
      };
    }
    return {
      found: true,
      refId: txn.refId,
      rail,
      status: txn.status,
      providerStatus: "UNRESOLVED",
      outcome: "unresolved",
    };
  }

  const partnerTxnId = resolved.payRef ?? txn.partnerTxnId;

  // Already-terminal failed row that the provider confirms SUCCESS → corrective
  // promotion + lien clawback.
  if (isTerminalFailed) {
    if (resolved.status === "SUCCESS") {
      if (!providerAmountMatches(resolved.amount, Number(txn.amount))) {
        await prisma.auditLog.create({
          data: {
            userId: opts.actorId,
            action: "txn.resolve.amount_mismatch",
            entity: "Transaction",
            entityId: txn.id,
            meta: {
              refId: txn.refId,
              rowAmount: Number(txn.amount),
              providerAmount: resolved.amount,
              source,
            },
          },
        });
        return {
          found: true,
          refId: txn.refId,
          rail,
          status: txn.status,
          providerStatus: "SUCCESS",
          outcome: "amount_mismatch",
          providerAmount: resolved.amount ?? undefined,
        };
      }
      const r = await correctTerminalToSuccess({
        txn,
        partnerTxnId,
        raw: resolved.raw,
        actorId: opts.actorId,
        source,
        remarks: opts.remarks,
      });
      return {
        found: true,
        refId: txn.refId,
        rail,
        status: txn.status,
        providerStatus: "SUCCESS",
        outcome: r.corrected ? "corrected" : "noop",
        clawback: { placed: r.clawbackPlaced, refunded: r.refunded, lienId: r.lienId },
      };
    }
    return {
      found: true,
      refId: txn.refId,
      rail,
      status: txn.status,
      providerStatus: resolved.status,
      outcome: "noop",
    };
  }

  // Non-terminal (NEEDS_REVIEW / PROCESSING) → settle or refund via finalizer.
  if (resolved.status === "PENDING") {
    return {
      found: true,
      refId: txn.refId,
      rail,
      status: txn.status,
      providerStatus: "PENDING",
      outcome: "noop",
    };
  }
  const res = await finalizeServiceTransaction({
    txn,
    status:
      resolved.status === "SUCCESS"
        ? "SUCCESS"
        : resolved.status === "REFUNDED"
        ? "REFUNDED"
        : "FAILED",
    partnerTxnId,
    errorCode: resolved.status !== "SUCCESS" ? `PROVIDER_${resolved.status}` : undefined,
    raw: resolved.raw,
    source,
  });
  return {
    found: true,
    refId: txn.refId,
    rail,
    status: txn.status,
    providerStatus: resolved.status,
    outcome:
      res.outcome === "settled" ? "settled" : res.outcome === "refunded" ? "refunded" : "noop",
  };
}

/**
 * Webhook-safe, NON-corrective reconcile of a single transaction by any
 * provider reference — the instant twin of the BBPS recon "drain" stage.
 *
 * Unlike {@link correctOneTransaction}, this NEVER promotes an already-terminal
 * FAILED/REFUNDED row to SUCCESS (no lien clawback), so it needs no admin actor
 * and is safe to drive from an unauthenticated-but-signature-verified webhook.
 */
export async function reconcileNonTerminalByRef(
  ref: string,
  opts: { source?: string; providerRef?: string } = {}
): Promise<CorrectOneResult> {
  const txn = await prisma.transaction.findFirst({
    where: { OR: [{ refId: ref }, { partnerTxnId: ref }] },
    select: { ...FINALIZABLE_TXN_SELECT, request: true, response: true },
  });
  if (!txn) return { found: false };

  const rail = railFor(txn.partner, txn.service);
  if (!rail) {
    return {
      found: true,
      refId: txn.refId,
      rail: "bbps",
      status: txn.status,
      providerStatus: "NOT_POLLED",
      outcome: "not_applicable",
    };
  }

  if (["SUCCESS", "FAILED", "REFUNDED"].includes(txn.status)) {
    return {
      found: true,
      refId: txn.refId,
      rail,
      status: txn.status,
      providerStatus: "NOT_POLLED",
      outcome: "noop",
    };
  }

  const refs = Array.from(
    new Set(
      [
        opts.providerRef,
        ...deriveTxnRefs({
          partnerTxnId: txn.partnerTxnId,
          request: txn.request,
          response: txn.response,
        }),
      ].filter(Boolean) as string[]
    )
  );
  const resolved = await resolveProviderStatus(rail, refs);
  const source = opts.source ?? "webhook";

  if (!resolved) {
    return {
      found: true,
      refId: txn.refId,
      rail,
      status: txn.status,
      providerStatus: "UNRESOLVED",
      outcome: "unresolved",
    };
  }
  if (resolved.status === "PENDING") {
    return {
      found: true,
      refId: txn.refId,
      rail,
      status: txn.status,
      providerStatus: "PENDING",
      outcome: "noop",
    };
  }

  const res = await finalizeServiceTransaction({
    txn,
    status:
      resolved.status === "SUCCESS"
        ? "SUCCESS"
        : resolved.status === "REFUNDED"
        ? "REFUNDED"
        : "FAILED",
    partnerTxnId: resolved.payRef ?? txn.partnerTxnId,
    errorCode: resolved.status !== "SUCCESS" ? `PROVIDER_${resolved.status}` : undefined,
    raw: resolved.raw,
    source,
  });
  return {
    found: true,
    refId: txn.refId,
    rail,
    status: txn.status,
    providerStatus: resolved.status,
    outcome:
      res.outcome === "settled" ? "settled" : res.outcome === "refunded" ? "refunded" : "noop",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY live status probe (powers the admin "Fetch live status" button)
// ─────────────────────────────────────────────────────────────────────────────

export type LiveStatusResult =
  | { found: false }
  | {
      found: true;
      refId: string;
      status: TxnStatus;
      rail: Rail | "unsupported";
      pollable: boolean;
      /**
       * Authoritative provider status. "UNRESOLVED" = every ref returned
       * no match — the signal for a "Not found — refund" action.
       * "NOT_POLLED" = unsupported rail.
       */
      providerStatus: ProviderStatus | "UNRESOLVED" | "NOT_POLLED";
      /** Pay-step reference recovered from the poll response (order_id / txn_id). */
      requestId: string | null;
      /** Which of our candidate refs the provider answered on. */
      matchedRef: string | null;
      amount: number | null;
      candidates: string[];
    };

/**
 * READ-ONLY live provider status probe for a single transaction.
 *
 * Mutates NOTHING — no ledger movement, no status transition.
 * Powers the admin "Fetch live status" action so ops can see the current
 * provider verdict before deciding to Resolve/verify or force a Not-found refund.
 */
export async function checkProviderStatusOne(ref: string): Promise<LiveStatusResult> {
  const needle = ref.trim();
  if (!needle) return { found: false };

  const row = await prisma.transaction.findFirst({
    where: { OR: [{ refId: needle }, { partnerTxnId: needle }] },
    select: { ...FINALIZABLE_TXN_SELECT, request: true, response: true },
  });
  if (!row) return { found: false };

  const { request, response, ...txn } = row;
  const rail = railFor(txn.partner, txn.service);

  if (!rail) {
    return {
      found: true,
      refId: txn.refId,
      status: txn.status,
      rail: "unsupported",
      pollable: false,
      providerStatus: "NOT_POLLED",
      requestId: null,
      matchedRef: null,
      amount: null,
      candidates: [],
    };
  }

  const candidates = Array.from(
    new Set(
      deriveTxnRefs({ partnerTxnId: txn.partnerTxnId, request, response }).filter(
        (s) => s.length > 0
      )
    )
  );

  const resolved = candidates.length ? await resolveProviderStatus(rail, candidates) : null;
  if (!resolved) {
    return {
      found: true,
      refId: txn.refId,
      status: txn.status,
      rail,
      pollable: candidates.length > 0,
      providerStatus: "UNRESOLVED",
      requestId: null,
      matchedRef: null,
      amount: null,
      candidates,
    };
  }

  return {
    found: true,
    refId: txn.refId,
    status: txn.status,
    rail,
    pollable: true,
    providerStatus: resolved.status,
    requestId: resolved.payRef,
    matchedRef: resolved.matchedRef,
    amount: resolved.amount,
    candidates,
  };
}
