import { NextResponse } from "next/server";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const GONE = NextResponse.json(
  { error: "Network scheme management has been removed. Schemes are now assigned by admin only." },
  { status: 410 }
);

export async function GET() { return GONE; }
export async function POST() { return GONE; }
