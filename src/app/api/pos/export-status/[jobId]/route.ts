import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { getPosExportStatus } from "@/lib/partners/sameday-pos";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { isAdminRole, scopeUserIdFilter } from "@/lib/security/ownership";
import { toErrorResponse } from "@/lib/security/apiErrors";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return toErrorResponse(e);
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

  // Ownership: a non-admin may only poll an export job they created. We match
  // against the audit row written when the job was created (within their scope).
  if (!isAdminRole(user.role)) {
    const scope = await scopeUserIdFilter(user);
    const owns = await prisma.auditLog.findFirst({
      where: { action: "pos.export.create", entityId: jobId, userId: scope.userId },
      select: { id: true },
    });
    if (!owns) {
      return NextResponse.json({ error: "Export job not found" }, { status: 404 });
    }
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
