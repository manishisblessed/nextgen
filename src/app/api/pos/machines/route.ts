import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { getPosMachines } from "@/lib/partners/sameday-pos";
import { flags } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const status = searchParams.get("status") as "active" | "inactive" | "maintenance" | "decommissioned" | undefined;
  const machine_type = searchParams.get("machine_type") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  const result = await getPosMachines({
    page: isNaN(page) ? 1 : page,
    limit: isNaN(limit) ? 50 : Math.min(limit, 100),
    status: status || undefined,
    machine_type,
    search,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error?.message ?? "Failed to fetch POS machines" },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
