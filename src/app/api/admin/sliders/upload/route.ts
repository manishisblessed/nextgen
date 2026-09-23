import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";

// Minimum source resolution so banners/pop-ups render in HD at every
// breakpoint. Keep in sync with the admin slider UI.
const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 300;

export const dynamic = "force-dynamic";

// Server-side upload keeps the asset handling admin-gated and avoids a
// browser → Cloudinary cross-origin call (our CSP connect-src is 'self').
const Body = z.object({
  dataUrl: z
    .string()
    .min(32)
    .max(8_000_000) // ~6MB binary once base64-encoded
    .regex(/^data:image\/(png|jpe?g|webp|gif|avif);base64,/, "Must be an image data URL"),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "slider.upload",
      roles: ["MASTER_ADMIN", "ADMIN", "SUPPORT"],
      entity: "Slider",
    });
    await enforceRateLimit(`slider:upload:${admin.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await uploadToCloudinary(parsed.data.dataUrl, {
      userId: admin.id,
      type: "slider",
      isSensitive: false,
    });

    // Guarantee HD: reject (and clean up) anything below the minimum resolution
    // so a low-res asset never lands in the slider surface.
    if (
      typeof result.width === "number" &&
      typeof result.height === "number" &&
      (result.width < MIN_IMAGE_WIDTH || result.height < MIN_IMAGE_HEIGHT)
    ) {
      await deleteFromCloudinary(result.public_id).catch(() => {
        /* best-effort cleanup */
      });
      return NextResponse.json(
        {
          error: `Image is only ${result.width}×${result.height}px. Upload at least ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px for a crisp HD banner.`,
        },
        { status: 400 }
      );
    }

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "slider.upload",
        entity: "Slider",
        entityId: result.public_id,
        meta: { publicId: result.public_id, format: result.format },
      },
    });

    return NextResponse.json({
      ok: true,
      publicId: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (e: unknown) {
    console.error("[admin/sliders/upload] error:", e);
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  }
}
