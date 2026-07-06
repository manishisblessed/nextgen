import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { uploadToCloudinary } from "@/lib/cloudinary";

const Body = z.object({
  dataUrl: z.string().startsWith("data:"),
  type: z.enum(["approval_signature", "approval_selfie"]),
});

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireAuth();

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await uploadToCloudinary(parsed.data.dataUrl, {
    userId: user.id,
    type: parsed.data.type,
    isSensitive: true,
  });

  return NextResponse.json({ url: result.secure_url });
}
