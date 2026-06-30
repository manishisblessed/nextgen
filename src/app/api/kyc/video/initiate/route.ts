import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { withIdempotency } from "@/lib/idempotency";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { initiateKycVideo, KycVideoError } from "@/lib/kyc/video/service";

const Body = z
  .object({
    // Explicit, affirmative biometric-capture consent (DPDP). Must be true.
    consent: z.literal(true),
    contentType: z.enum(["video/mp4", "video/webm"]),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    // Abuse control: limit per user AND per IP so retries don't churn presigns.
    await enforceRateLimit(`kyc:video:initiate:user:${user.id}`, RATE_LIMITS.kycVideo);
    await enforceRateLimit(`kyc:video:initiate:ip:${ip}`, RATE_LIMITS.kycVideo);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const idemKey =
      req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || nanoid();

    // Idempotent so a double-tap reuses the same presign instead of minting a new key.
    const result = await withIdempotency(
      { key: idemKey, scope: "kyc.video.initiate", userId: user.id, ttlSec: 120 },
      () =>
        initiateKycVideo(
          user,
          { consent: parsed.data.consent, contentType: parsed.data.contentType },
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
