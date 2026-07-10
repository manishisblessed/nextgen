import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { presignKycVideoGet } from "@/lib/storage/s3Kyc";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * Returns a short-TTL presigned GET URL for the onboard liveness video
 * stored in S3, so admins can view it from the invite detail page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!["MASTER_ADMIN", "ADMIN", "SUPPORT"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const video = await prisma.verificationResult.findFirst({
    where: { inviteId: id, type: "ONBOARD_VIDEO", status: "Uploaded" },
    orderBy: { createdAt: "desc" },
    select: { requestPayload: true },
  });

  if (!video) {
    return NextResponse.json(
      { error: "No onboard video found for this invite" },
      { status: 404 }
    );
  }

  const payload = video.requestPayload as Record<string, unknown> | null;
  const key = payload?.key;

  if (typeof key !== "string" || !key) {
    return NextResponse.json(
      { error: "Video storage key missing" },
      { status: 404 }
    );
  }

  const url = await presignKycVideoGet(key, { expiresInSec: 60 });

  return NextResponse.json({ url, expiresInSec: 60 });
}
