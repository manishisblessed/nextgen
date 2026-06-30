import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { partnerStatus } from "@/lib/partners";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = "down";
  try {
    await prisma.$queryRaw`select 1`;
    db = "up";
  } catch {
    db = "down";
  }

  return NextResponse.json({
    ok: db === "up",
    db,
    partners: partnerStatus(),
    time: new Date().toISOString()
  });
}
