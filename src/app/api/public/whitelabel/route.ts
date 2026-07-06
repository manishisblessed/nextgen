import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Public tenancy resolver (Phase 4).
 * GET /api/public/whitelabel?host=kapoorpay.in  (or ?subdomain=kapoorpay)
 *
 * Maps a request host to a LIVE whitelabel brand. Only public branding fields
 * are returned — never the owner's identity. Responses are cacheable for 5 min.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = url.searchParams.get("host")?.toLowerCase().split(":")[0] ?? null;
  const subdomain = url.searchParams.get("subdomain")?.toLowerCase() ?? null;

  if (!host && !subdomain) {
    return NextResponse.json({ error: "host or subdomain required" }, { status: 400 });
  }

  const profile = await prisma.whitelabelProfile.findFirst({
    where: {
      status: "LIVE",
      OR: [
        ...(host ? [{ customDomain: host }, { subdomain: host.split(".")[0] }] : []),
        ...(subdomain ? [{ subdomain }] : []),
      ],
    },
    select: {
      brandName: true,
      tagline: true,
      logoUrl: true,
      faviconUrl: true,
      primaryColor: true,
      accentColor: true,
      supportEmail: true,
      supportPhone: true,
      subdomain: true,
      customDomain: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ brand: null }, { status: 404 });
  }

  return NextResponse.json(
    { brand: profile },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  );
}
