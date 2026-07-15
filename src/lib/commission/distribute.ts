import type { Prisma, ServiceCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";
import { resolvePricingChain } from "@/lib/scheme/resolver";
import { resolveMdrChain, type MdrDimensions } from "@/lib/mdr/resolver";
import type { MdrServiceKind } from "@prisma/client";
import { gt, toNumber, dec, round, mul, sub, type Money } from "@/lib/money";

/**
 * Multi-tier commission distribution engine (cascade model).
 *
 * After a successful transaction, the pricing chain is resolved across the
 * network (RT → DT → MD → SD). Each member's GROSS commission is:
 *   - transacting user: their own scheme's commissionValue for the slab;
 *   - each ancestor:    the margin between their child's scheme rate and
 *                       their own scheme rate (charge and/or commission).
 *
 * 2% TDS (Section 194H style) is withheld from every gross commission; the
 * NET is credited to the wallet and the gross/TDS/net breakdown is recorded
 * on the CommissionCredit row for certificates and reporting.
 *
 * Every credit is idempotency-keyed so retries or duplicate webhook
 * deliveries can never double-pay.
 */

/** TDS withheld on every commission payout (2%). */
export const TDS_RATE = 0.02;

/** Split a gross commission into TDS + net at money scale. */
export function applyTds(gross: Money): { tds: Money; net: Money } {
  const tds = round(mul(gross, TDS_RATE));
  return { tds, net: round(sub(gross, tds)) };
}

const TIER_LABEL: Record<string, string> = {
  RETAILER: "RETAILER",
  DISTRIBUTOR: "DISTRIBUTOR",
  MASTER_DISTRIBUTOR: "MASTER",
  SUPER_DISTRIBUTOR: "SUPER",
};

type CreditResult = {
  userId: string;
  tier: string;
  role: string;
  gross: number;
  tds: number;
  amount: number; // net credited
  walletTxnId: string | null;
};

type ChainCredit = {
  userId: string;
  role: string;
  gross: Money;
  schemeId: string | null;
};

async function creditChain(
  txnId: string,
  service: ServiceCode,
  txnAmount: number | Money,
  credits: ChainCredit[],
  tx?: Prisma.TransactionClient
): Promise<CreditResult[]> {
  const results: CreditResult[] = [];

  for (const member of credits) {
    if (!gt(member.gross, 0)) continue;

    const { tds, net } = applyTds(member.gross);
    if (!gt(net, 0)) continue;

    const baseKey = `commission:${txnId}:${member.userId}`;

    let walletTxnId: string | null = null;
    try {
      const wtxn = await creditWallet(
        {
          userId: member.userId,
          amount: net,
          reason: "COMMISSION",
          refType: "Transaction",
          refId: txnId,
          note: `Commission on ${service} txn (gross ₹${member.gross}, TDS ₹${tds})`,
          idempotencyKey: baseKey,
        },
        tx
      );
      walletTxnId = wtxn.id;
    } catch {
      // Ledger errors (user not found, etc.) — skip this tier, don't block the chain
    }

    const tierLabel = TIER_LABEL[member.role] ?? member.role;

    const p = tx ?? prisma;
    await p.commissionCredit.create({
      data: {
        transactionId: txnId,
        userId: member.userId,
        tier: tierLabel,
        amount: net,
        grossAmount: member.gross,
        tdsAmount: tds,
        walletTxnId,
        schemeId: member.schemeId,
        service,
        txnAmount: dec(txnAmount),
      },
    });

    results.push({
      userId: member.userId,
      tier: tierLabel,
      role: member.role,
      gross: toNumber(member.gross),
      tds: toNumber(tds),
      amount: toNumber(net),
      walletTxnId,
    });
  }

  return results;
}

/**
 * Distribute commission for a successful service transaction to the user and
 * their parent chain (margin-based). Returns the list of credits applied.
 *
 * @param txnId        - Transaction.id (for refs and idempotency)
 * @param userId       - the transacting user
 * @param service      - ServiceCode for scheme lookup
 * @param txnAmount    - original transaction amount
 * @param tx           - optional Prisma transaction client
 * @param provider     - partner route handling the txn (provider-scoped slabs)
 */
export async function distributeCommission(
  txnId: string,
  userId: string,
  service: ServiceCode,
  txnAmount: number | Money,
  tx?: Prisma.TransactionClient,
  provider?: string | null
): Promise<CreditResult[]> {
  const chain = await resolvePricingChain(userId, service, txnAmount, provider);
  if (!chain.ok) return [];

  return creditChain(
    txnId,
    service,
    txnAmount,
    chain.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      gross: m.gross,
      schemeId: m.schemeId,
    })),
    tx
  );
}

/**
 * Distribute MDR-margin commission for a POS/PG/QR/UPI capture. The machine
 * owner's ancestors each earn the MDR difference between their child's scheme
 * and their own, net of 2% TDS.
 *
 * @param txnId       - Transaction.id (synthetic settlement txn for the FK)
 * @param userId      - the machine owner (transacting user)
 * @param serviceKind - POS | PG | QR | UPI
 * @param grossAmount - full capture amount
 * @param dims        - payment mode + company/card dimensions + T0/T1
 */
export async function distributeMdrCommission(
  txnId: string,
  userId: string,
  serviceKind: MdrServiceKind,
  grossAmount: number | Money,
  service: ServiceCode,
  dims: MdrDimensions | string = {}
): Promise<CreditResult[]> {
  const chain = await resolveMdrChain(userId, serviceKind, grossAmount, dims);
  if (!chain.ok) return [];

  return creditChain(
    txnId,
    service,
    grossAmount,
    chain.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      gross: m.gross,
      schemeId: m.schemeId,
    }))
  );
}
