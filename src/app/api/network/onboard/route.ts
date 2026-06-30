import { NextResponse } from "next/server";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Direct onboarding is disabled. All onboarding is now done via invite links." },
    { status: 410 }
  );
}
