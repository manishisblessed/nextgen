import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const severity = searchParams.get("severity");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 50)));

    const where: Record<string, unknown> = {};

    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entity: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    if (severity && severity !== "all") {
      const severityActions: Record<string, string[]> = {
        danger: ["user.suspend", "user.close", "kyc.reject"],
        warn: ["commission.update", "commission.deactivate", "fund_request.reject"],
        info: ["kyc.approve", "fund_request.approve", "user.activate", "commission.create"],
      };
      if (severityActions[severity]) {
        where.action = { in: severityActions[severity] };
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: where as any,
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where: where as any }),
    ]);

    const severityMap = (action: string) => {
      if (["user.suspend", "user.close", "kyc.reject"].includes(action)) return "danger";
      if (["commission.update", "commission.deactivate", "fund_request.reject"].includes(action)) return "warn";
      return "info";
    };

    const mapped = logs.map((l) => ({
      id: l.id,
      actor: l.user?.email ?? "system",
      action: l.action,
      target: [l.entity, l.entityId].filter(Boolean).join(" · ") || "—",
      ip: l.ip ?? "n/a",
      severity: severityMap(l.action),
      ts: l.createdAt.toLocaleString("en-IN", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      meta: l.meta,
    }));

    return NextResponse.json({ events: mapped, total, page, pageSize });
  } catch (e: any) {
    if (e?.name === "AuthError") return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[admin/audit] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
