import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { buildDeclarationData } from "@/lib/declaration/data";
import { generateSuccessorDeclarationPdf } from "@/lib/declaration/generatePdf";
import { signedPdfUrl } from "@/lib/cloudinary";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();

  const approval = await prisma.declarationApproval.findUnique({ where: { id } });
  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }
  if (approval.approverId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Once approved, serve the stored, signed audit record.
  if (approval.status === "APPROVED" && approval.declarationDocUrl) {
    return NextResponse.redirect(signedPdfUrl(approval.declarationDocUrl));
  }

  // Otherwise generate the prefilled (unsigned) responsibility form for review.
  const data = await buildDeclarationData(approval.inviteId);
  if (!data) {
    return NextResponse.json({ error: "Unable to prepare declaration" }, { status: 404 });
  }

  const pdfBytes = await generateSuccessorDeclarationPdf(data);

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="responsibility-declaration-${approval.id.slice(-6)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
