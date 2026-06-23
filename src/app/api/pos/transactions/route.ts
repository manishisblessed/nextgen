import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { getPosTransactions } from "@/lib/partners/sameday-pos";
import { flags } from "@/lib/env";

export const dynamic = "force-dynamic";

const schema = z.object({
  date_from: z.string().min(1, "date_from is required"),
  date_to: z.string().min(1, "date_to is required"),
  status: z.enum(["AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "VOIDED"]).nullable().optional(),
  terminal_id: z.string().nullable().optional(),
  payment_mode: z.enum(["CARD", "UPI", "NFC", "CASH", "WALLET", "NETBANKING", "BHARATQR"]).nullable().optional(),
  page: z.number().int().positive().optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(50),
});

export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!flags.pos) {
    return NextResponse.json(
      { error: "POS service is not enabled" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const result = await getPosTransactions(parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error?.message ?? "Failed to fetch POS transactions" },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
