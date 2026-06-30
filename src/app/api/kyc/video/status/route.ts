import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getLivenessStatus } from "@/lib/kyc/video/service";

/** Drives the dashboard liveness banner/modal + capture page. Read-only, per-user. */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const status = await getLivenessStatus(user);
    return NextResponse.json(status);
  } catch (e) {
    return toErrorResponse(e);
  }
}
