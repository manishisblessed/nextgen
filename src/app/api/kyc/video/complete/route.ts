import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { withIdempotency } from "@/lib/idempotency";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { completeKycVideo, KycVideoError } from "@/lib/kyc/video/service";

const Body = z
  .object({
    key: z.string().trim().min(8).max(256),
    uploadToken: z.string().trim().min(8).max(512),
    contentType: z.enum(["video/mp4", "video/webm"]),
    durationSec: z.number().positive().max(60),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    await enforceRateLimit(`kyc:video:complete:user:${user.id}`, RATE_LIMITS.kycVideo);
    await enforceRateLimit(`kyc:video:complete:ip:${ip}`, RATE_LIMITS.kycVideo);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const idemKey =
      req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || nanoid();

    const result = await withIdempotency(
      { key: idemKey, scope: "kyc.video.complete", userId: user.id, ttlSec: 600 },
      () =>
        completeKycVideo(
          user,
          {
            key: parsed.data.key,
            uploadToken: parsed.data.uploadToken,
            contentType: parsed.data.contentType,
            durationSec: parsed.data.durationSec,
          },
          { ip, userAgent }
        )
    );

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof KycVideoError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    }
    return toErrorResponse(e);
  }
}
