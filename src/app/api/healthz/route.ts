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
    // Presence booleans only (never values) — lets ops verify the runtime
    // actually received critical env vars (Amplify bakes them in at build).
    config: {
      nextauthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      nextauthUrl: Boolean(process.env.NEXTAUTH_URL),
      databaseUrl: Boolean(process.env.DATABASE_URL),
      encryptionKey: Boolean(process.env.APP_ENCRYPTION_KEY),
    },
    partners: partnerStatus(),
    time: new Date().toISOString()
  });
}
