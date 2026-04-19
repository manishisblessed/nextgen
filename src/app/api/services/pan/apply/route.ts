import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartner } from "@/lib/partners";
import { runTransaction } from "@/lib/services/transaction";
import { hmac } from "@/lib/crypto";

const Body = z.object({
  applicantName: z.string().min(2),
  fatherName: z.string().min(2),
  dob: z.string(),
  gender: z.enum(["M", "F"]),
  email: z.string().email(),
  phone: z.string().min(10),
  addressLine: z.string().min(4),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().length(6),
  aadhaar: z.string().min(12).max(14),
  category: z.enum(["INDIVIDUAL", "HUF", "FIRM"]),
  idempotencyKey: z.string().min(8)
});

export async function POST(req: Request) {
  const userId = "demo-user-id";
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const partner = getPartner("pan");
  const aadhaarRef = hmac(parsed.data.aadhaar);

  const result = await runTransaction({
    userId,
    service: "PAN_CARD",
    amount: 107, // government fee
    commission: 30,
    idempotencyKey: parsed.data.idempotencyKey,
    customer: parsed.data.applicantName,
    operator: "NSDL",
    partner: partner.name,
    request: { ...parsed.data, aadhaar: undefined, aadhaarRef },
    call: () => partner.apply({ userId, ...parsed.data, aadhaarRef })
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 502 });
}
