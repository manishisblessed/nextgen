import { NextResponse } from "next/server";
import { getSignedUploadParams } from "@/lib/cloudinary";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";

const Body = z.object({
  type: z.string().min(2),
  isSensitive: z.boolean().optional()
});

export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const params = getSignedUploadParams({
    userId: user.id,
    type: parsed.data.type,
    isSensitive: parsed.data.isSensitive ?? true
  });

  return NextResponse.json(params);
}
