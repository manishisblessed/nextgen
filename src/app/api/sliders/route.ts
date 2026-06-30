import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { serializePublicSlider } from "@/lib/sliders";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

/**
 * Public surface feed. Returns only sliders that are `active`, currently inside
 * their [startAt, endAt] window, and targeted to the caller's role
 * (audienceRoles empty = everyone). Split into `slides` and `popups`.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const now = new Date();

    const rows = await prisma.slider.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          {
            OR: [
              { audienceRoles: { isEmpty: true } },
              { audienceRoles: { has: user.role } },
            ],
          },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const slides = rows.filter((r) => r.kind === "SLIDE").map(serializePublicSlider);
    const popups = rows.filter((r) => r.kind === "POPUP").map(serializePublicSlider);

    return NextResponse.json({ slides, popups });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    console.error("[sliders] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
