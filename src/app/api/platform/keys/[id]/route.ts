import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";

/** Revoke a partner API key (owner only). Revocation is immediate and permanent. */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return toErrorResponse(e);
  }

  const key = await prisma.apiKey.findUnique({ where: { id: params.id } });
  if (!key || key.userId !== user.id) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  if (key.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "apikey.revoked",
      entity: "ApiKey",
      entityId: key.id,
      meta: { keyId: key.keyId, label: key.label },
    },
  });

  return NextResponse.json({ ok: true });
}
