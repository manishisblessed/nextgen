import { NextResponse } from "next/server";
import { getSignedUploadParams } from "@/lib/cloudinary";
import { z } from "zod";

const Body = z.object({
  type: z.string().min(2),
  isSensitive: z.boolean().optional()
});

export async function POST(req: Request) {
  // TODO: replace with real session check (NextAuth getServerSession)
  // const session = await auth();
  // if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = "demo-user"; // session.user.id
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const params = getSignedUploadParams({
    userId,
    type: parsed.data.type,
    isSensitive: parsed.data.isSensitive ?? true
  });

  return NextResponse.json(params);
}
