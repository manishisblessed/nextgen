import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { getSchemeStatus } from "@/lib/scheme/gate";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/scheme-status
 *
 * Lightweight status for the dashboard banner: does the caller have an
 * active scheme (and MDR scheme) assigned? Network roles only — staff
 * accounts report applicable: false.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const status = await getSchemeStatus(user.id);
    return NextResponse.json(status);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
}
