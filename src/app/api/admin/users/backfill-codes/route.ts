import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { backfillUserCodes } from "@/lib/userCode";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const assigned = await backfillUserCodes();
  return NextResponse.json({ ok: true, assigned });
}
