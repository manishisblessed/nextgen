import { prisma } from "@/lib/db";
import { getPosMachines } from "@/lib/partners/sameday-pos";
import { isAdminRole, scopeUserIdFilter } from "@/lib/security/ownership";
import type { SessionUser } from "@/lib/auth-server";
import type {
  PosMachine as ExternalPosMachine,
  LocalPosMachine,
  PosSyncResult,
} from "@/lib/partners/sameday-pos.types";

/**
 * POS assignment layer.
 *
 * Machines are sourced externally (Same Day Solution, read-only). We mirror
 * that inventory into the local `PosMachine` table so we can OWN the mapping
 * of a physical terminal to a platform user. The sync only ever touches the
 * denormalized display fields + `meta` — it never modifies the assignment
 * columns, which are our source of truth.
 */

const SYNC_PAGE_LIMIT = 100; // external API hard cap is 100/page
const MAX_PAGES = 50; // safety bound: up to 5,000 machines per sync

type ExternalMachineRow = ExternalPosMachine;

/** Map an external machine into the columns we persist locally. */
function toSyncedFields(m: ExternalMachineRow) {
  return {
    mid: m.mid ?? null,
    tid: m.tid ?? null,
    serial: m.serial_number ?? null,
    model: m.brand ?? m.machine_type ?? null,
    provider: "SAMEDAY",
    status: m.status ?? "active",
    location: m.location ?? null,
    city: m.city ?? null,
    state: m.state ?? null,
    meta: m as unknown as object,
    syncedAt: new Date(),
  };
}

/**
 * Pull the full external machine inventory and upsert it into `PosMachine`.
 * Assignment fields are preserved across syncs. Returns sync counters.
 */
export async function syncPosMachines(): Promise<PosSyncResult> {
  let page = 1;
  let scanned = 0;
  let created = 0;
  let updated = 0;

  for (; page <= MAX_PAGES; page++) {
    const res = await getPosMachines({ page, limit: SYNC_PAGE_LIMIT });
    if (!res.ok) {
      throw new Error(
        res.error.error?.message ?? "Failed to fetch POS machines from provider"
      );
    }

    const machines = res.data.data ?? [];
    if (machines.length === 0) break;

    const externalIds = machines.map((m) => m.id);
    const existing = await prisma.posMachine.findMany({
      where: { externalId: { in: externalIds } },
      select: { externalId: true },
    });
    const existingSet = new Set(existing.map((e) => e.externalId));

    for (const m of machines) {
      const fields = toSyncedFields(m);
      await prisma.posMachine.upsert({
        where: { externalId: m.id },
        update: fields,
        create: { externalId: m.id, ...fields },
      });
      scanned++;
      if (existingSet.has(m.id)) updated++;
      else created++;
    }

    const pg = res.data.pagination;
    if (!pg?.has_next_page) break;
  }

  return { ok: true, scanned, created, updated };
}

type PosMachineWithAssignee = {
  id: string;
  externalId: string;
  mid: string | null;
  tid: string | null;
  serial: string | null;
  model: string | null;
  provider: string;
  status: string;
  location: string | null;
  city: string | null;
  state: string | null;
  assignedUserId: string | null;
  assignedAt: Date | null;
  syncedAt: Date;
  assignedUser: {
    id: string;
    name: string;
    phone: string;
    role: string;
  } | null;
};

/** Prisma `select` that includes the assignee summary for serialization. */
export const posMachineSelect = {
  id: true,
  externalId: true,
  mid: true,
  tid: true,
  serial: true,
  model: true,
  provider: true,
  status: true,
  location: true,
  city: true,
  state: true,
  assignedUserId: true,
  assignedAt: true,
  syncedAt: true,
  assignedUser: {
    select: { id: true, name: true, phone: true, role: true },
  },
} as const;

/**
 * Resolve which POS terminal IDs (`tid`) a user may query at the partner.
 *
 * The partner account is tenant-wide, so the partner-proxy routes
 * (transactions/export) would otherwise expose every terminal to any logged-in
 * user. Assignment is owned locally in `PosMachine.assignedUserId`, so we scope
 * non-admins to the terminals assigned to them (and, for parents, their
 * downline). Admins are unrestricted.
 */
export async function scopePosTerminals(
  user: SessionUser
): Promise<{ all: boolean; tids: string[] }> {
  if (isAdminRole(user.role)) return { all: true, tids: [] };

  const scope = await scopeUserIdFilter(user); // { userId: { in: [...] } } for non-admins
  const rows = await prisma.posMachine.findMany({
    where: { assignedUserId: scope.userId, tid: { not: null } },
    select: { tid: true },
  });
  const tids = Array.from(
    new Set(rows.map((r) => r.tid).filter((t): t is string => Boolean(t)))
  );
  return { all: false, tids };
}

/** Serialize a DB row (with assignee) into the API/UI shape. */
export function serializePosMachine(
  row: PosMachineWithAssignee
): LocalPosMachine {
  return {
    id: row.id,
    externalId: row.externalId,
    mid: row.mid,
    tid: row.tid,
    serial: row.serial,
    model: row.model,
    provider: row.provider,
    status: row.status,
    location: row.location,
    city: row.city,
    state: row.state,
    assignedUserId: row.assignedUserId,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    assignee: row.assignedUser
      ? {
          id: row.assignedUser.id,
          name: row.assignedUser.name,
          phone: row.assignedUser.phone,
          role: row.assignedUser.role,
        }
      : null,
    syncedAt: row.syncedAt.toISOString(),
  };
}
