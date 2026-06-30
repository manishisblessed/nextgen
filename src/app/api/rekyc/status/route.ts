import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getReKycStatus } from "@/lib/rekyc/service";

/** Drives the dashboard re-KYC banner/modal. Cheap, read-only, per-user. */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const status = await getReKycStatus(user);
    return NextResponse.json(status);
  } catch (e) {
    return toErrorResponse(e);
  }
}
