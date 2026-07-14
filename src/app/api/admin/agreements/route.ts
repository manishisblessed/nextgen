import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { signedPdfUrl, signedDeliveryUrl } from "@/lib/cloudinary";
import { clientIp, logSecurityEvent } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET — Agreements Vault: every signed AGREEMENT document across the network,
 * searchable by user. `download=<docId>` mints a short-lived signed URL
 * (audit-logged — these are legal documents).
 */
export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const url = new URL(req.url);

  const downloadId = url.searchParams.get("download");
  if (downloadId) {
    const doc = await prisma.document.findFirst({
      where: { id: downloadId, type: "AGREEMENT" },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!doc) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

    const signedUrl =
      doc.format === "pdf" || doc.resourceType === "image"
        ? signedPdfUrl(doc.publicId, { expiresInSec: 300 })
        : signedDeliveryUrl(doc.publicId, { expiresInSec: 300, format: doc.format ?? "jpg" });

    await logSecurityEvent({
      action: "agreement.downloaded",
      severity: "info",
      userId: admin.id,
      entity: "Document",
      entityId: doc.id,
      ip: clientIp(req),
      meta: { ownerUserId: doc.user.id, ownerName: doc.user.name },
    });

    return NextResponse.json({ url: signedUrl, expiresInSec: 300 });
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 25;

  const where = {
    type: "AGREEMENT" as const,
    ...(q
      ? {
          user: {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { shopName: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true, shopName: true, status: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    agreements: rows.map((d) => ({
      id: d.id,
      format: d.format,
      bytes: d.bytes,
      uploadedAt: d.uploadedAt.toISOString(),
      user: d.user,
    })),
    total,
    page,
    pageSize,
  });
}
