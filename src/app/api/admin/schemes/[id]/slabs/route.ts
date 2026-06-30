import { NextResponse } from "next/server";
import { z } from "zod";
import type { ServiceCode } from "@prisma/client";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { serializeSlab } from "@/lib/scheme/serialize";
import { validateNonOverlapping } from "@/lib/scheme/resolver";
import { SERVICE_CODES } from "@/lib/scheme/constants";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const SlabBody = z
  .object({
    service: z.enum(SERVICE_CODES),
    minAmount: z.number().min(0).max(100000000),
    maxAmount: z.number().min(0).max(100000000),
    chargeType: z.enum(["FLAT", "PERCENT"]).default("FLAT"),
    chargeValue: z.number().min(0),
    commissionType: z.enum(["FLAT", "PERCENT"]).default("PERCENT"),
    commissionRetailer: z.number().min(0).default(0),
    commissionDistributor: z.number().min(0).default(0),
    commissionMaster: z.number().min(0).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.maxAmount < v.minAmount)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxAmount"], message: "maxAmount must be ≥ minAmount" });
    // Percent values are fractions (0.0050 = 0.5%); guard against >100%.
    if (v.chargeType === "PERCENT" && v.chargeValue > 1)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chargeValue"], message: "Percent charge must be a fraction ≤ 1 (e.g. 0.005 = 0.5%)" });
    if (v.commissionType === "PERCENT") {
      for (const k of ["commissionRetailer", "commissionDistributor", "commissionMaster"] as const) {
        if (v[k] > 1)
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: "Percent commission must be a fraction ≤ 1" });
      }
    }
  });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const scheme = await prisma.scheme.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!scheme) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

  const parsed = SlabBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const overlap = await validateNonOverlapping(
    scheme.id,
    body.service as ServiceCode,
    { minAmount: body.minAmount, maxAmount: body.maxAmount }
  );
  if (overlap) return NextResponse.json({ error: overlap }, { status: 409 });

  const slab = await prisma.schemeSlab.create({
    data: {
      schemeId: scheme.id,
      service: body.service as ServiceCode,
      minAmount: body.minAmount,
      maxAmount: body.maxAmount,
      chargeType: body.chargeType,
      chargeValue: body.chargeValue,
      commissionType: body.commissionType,
      commissionRetailer: body.commissionRetailer,
      commissionDistributor: body.commissionDistributor,
      commissionMaster: body.commissionMaster,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "scheme.slab.create",
      entity: "SchemeSlab",
      entityId: slab.id,
      meta: { schemeId: scheme.id, service: body.service, minAmount: body.minAmount, maxAmount: body.maxAmount },
    },
  });

  return NextResponse.json({ ok: true, slab: serializeSlab(slab) }, { status: 201 });
}
