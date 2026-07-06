import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";

const Flight = z.object({ kind: z.literal("FLIGHT"), from: z.string().length(3), to: z.string().length(3), date: z.string(), returnDate: z.string().optional(), adults: z.number().int().min(1), children: z.number().int().optional(), infants: z.number().int().optional(), cabinClass: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).optional() });
const Hotel  = z.object({ kind: z.literal("HOTEL"),  city: z.string().min(2), checkIn: z.string(), checkOut: z.string(), guests: z.number().int().min(1), rooms: z.number().int().optional() });
const Bus    = z.object({ kind: z.literal("BUS"),    from: z.string().min(2), to: z.string().min(2), date: z.string() });
const Body = z.discriminatedUnion("kind", [Flight, Hotel, Bus]);

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Authenticated + throttled: this hits a paid partner search API.
  try {
    const user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.TRAVEL, { name: "Travel", userId: user.id, role: user.role });
    await enforceRateLimit(`travel:search:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const t = getPartner("travel");
  const result =
    parsed.data.kind === "FLIGHT" ? await t.searchFlights(parsed.data) :
    parsed.data.kind === "HOTEL"  ? await t.searchHotels(parsed.data)  :
                                    await t.searchBuses(parsed.data);

  return result.ok ? NextResponse.json(result.data) : NextResponse.json({ error: result.message, code: result.code }, { status: 502 });
}
