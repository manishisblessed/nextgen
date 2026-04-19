import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyRazorpayWebhook } from "@/lib/partners/razorpay";

/**
 * Razorpay webhook receiver.
 *
 * Configure in Razorpay dashboard → Settings → Webhooks:
 *   URL    : https://app.payprismindia.com/api/webhooks/razorpay
 *   Secret : RAZORPAY_WEBHOOK_SECRET (env)
 *   Events : payment_link.paid, payout.processed, payout.reversed, payout.failed
 */
export async function POST(req: Request) {
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const evt = JSON.parse(raw) as { event: string; payload: Record<string, { entity: Record<string, unknown> }> };

  switch (evt.event) {
    case "payment_link.paid": {
      const link = evt.payload.payment_link?.entity as { id: string; amount: number; status: string };
      // mark our pending UPI Collect transaction as SUCCESS
      await prisma.transaction.updateMany({
        where: { partnerTxnId: link.id, status: { in: ["INITIATED", "PROCESSING"] } },
        data: { status: "SUCCESS", response: link as unknown as Prisma.InputJsonValue }
      });
      break;
    }
    case "payout.processed":
    case "payout.reversed":
    case "payout.failed": {
      const payout = evt.payload.payout?.entity as { id: string; status: string; utr?: string };
      const map: Record<string, "SUCCESS" | "FAILED" | "PROCESSING"> = {
        processed: "SUCCESS", reversed: "FAILED", failed: "FAILED"
      };
      await prisma.transaction.updateMany({
        where: { partnerTxnId: payout.id },
        data: { status: map[payout.status] ?? "PROCESSING", response: payout as unknown as Prisma.InputJsonValue }
      });
      break;
    }
    default:
      // unknown events are acknowledged so Razorpay stops retrying
      break;
  }

  return NextResponse.json({ ok: true });
}
