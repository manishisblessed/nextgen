import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { getPosExportStatus } from "@/lib/partners/sameday-pos";
import { flags } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
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

  const { jobId } = params;
  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  const result = await getPosExportStatus(jobId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error?.message ?? "Failed to check export status" },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
