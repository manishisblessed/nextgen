import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { getEffectiveServiceKeys } from "@/lib/services/guard";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * Effective services for the signed-in user: keys that are BOTH enabled
 * globally (On/Off Services panel) AND enabled for this user by an admin
 * (staff roles see every globally-enabled service). The dashboard uses this
 * to show/hide service entry points.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const keys = await getEffectiveServiceKeys(user.id, user.role);
    return NextResponse.json({ services: keys });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[services/available] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
