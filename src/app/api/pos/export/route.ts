import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { createPosExport } from "@/lib/partners/sameday-pos";
import { flags } from "@/lib/env";

export const dynamic = "force-dynamic";

const schema = z.object({
  format: z.enum(["csv", "excel", "pdf", "zip"]),
  date_from: z.string().min(1, "date_from is required"),
  date_to: z.string().min(1, "date_to is required"),
  status: z.enum(["AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "VOIDED"]).nullable().optional(),
  terminal_id: z.string().nullable().optional(),
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

  const result = await createPosExport(parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error?.message ?? "Failed to create export job" },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data, { status: 202 });
}
