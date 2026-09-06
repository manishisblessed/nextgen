import { IdentityField, type Role } from "@prisma/client";
import { prisma } from "../db";

/**
 * Identity duplicate enforcement — APPLICATION layer.
 *
 * Since migration 20260906130000 relaxed the DB unique indexes on PAN / Aadhaar
 * / bank account / GST / Udyam / shop name, uniqueness is enforced HERE and must
 * stay airtight and fail-closed. The rule:
 *
 *   - By default an identity value may belong to at most one account.
 *   - A master-admin may grant value-scoped IdentityException rows so the SAME
 *     value can onboard up to FOUR accounts — one per network tier
 *     (SUPER_DISTRIBUTOR, MASTER_DISTRIBUTOR, DISTRIBUTOR, RETAILER).
 *   - One approved exception unlocks exactly one (field, value, role). A tier
 *     already held by an existing account can never be reused (one-per-tier).
 */

export type IdentityFieldKey =
  | "panNumber"
  | "aadhaarNumber"
  | "bankAccountNumber"
  | "gstin"
  | "msmeNumber"
  | "shopName";

export const IDENTITY_FIELD_MAP: Record<IdentityFieldKey, IdentityField> = {
  panNumber: IdentityField.PAN,
  aadhaarNumber: IdentityField.AADHAAR,
  bankAccountNumber: IdentityField.BANK_ACCOUNT,
  gstin: IdentityField.GSTIN,
  msmeNumber: IdentityField.MSME,
  shopName: IdentityField.SHOP_NAME,
};

export const IDENTITY_FIELD_LABELS: Record<IdentityFieldKey, string> = {
  panNumber: "PAN number",
  aadhaarNumber: "Aadhaar number",
  bankAccountNumber: "bank account number",
  gstin: "GST number",
  msmeNumber: "Udyam number",
  shopName: "shop name",
};

/** Per-field 409 error codes, matching the onboarding client's expectations. */
export const IDENTITY_DUPLICATE_CODES: Record<IdentityFieldKey, string> = {
  panNumber: "PAN_DUPLICATE",
  aadhaarNumber: "AADHAAR_DUPLICATE",
  bankAccountNumber: "BANK_DUPLICATE",
  gstin: "GST_DUPLICATE",
  msmeNumber: "MSME_DUPLICATE",
  shopName: "SHOPNAME_DUPLICATE",
};

/** Max accounts allowed to share one identity value (one per network tier). */
export const MAX_IDENTITY_SHARES = 4;

export type IdentityHolder = { userId: string; role: Role };

/** All existing accounts that already hold this identity value (excluding self). */
export async function findIdentityHolders(
  fieldKey: IdentityFieldKey,
  value: string,
  excludeUserId?: string
): Promise<IdentityHolder[]> {
  if (fieldKey === "shopName") {
    const users = await prisma.user.findMany({
      where: { shopName: value, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { id: true, role: true },
    });
    return users.map((u) => ({ userId: u.id, role: u.role }));
  }

  const rows = await prisma.kyc.findMany({
    where: {
      [fieldKey]: value,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true, user: { select: { role: true } } },
  });
  return rows.map((r) => ({ userId: r.userId, role: r.user.role }));
}

export type IdentityAvailability =
  | { ok: true; holders: IdentityHolder[] }
  | {
      ok: false;
      reason: "TIER_TAKEN" | "NEEDS_APPROVAL" | "LIMIT_REACHED";
      holders: IdentityHolder[];
    };

/**
 * Decide whether `value` may be used to onboard an account of `role`.
 *   - No existing holder → available.
 *   - A holder of the SAME role exists → TIER_TAKEN (never allowed).
 *   - Holders exist in other tiers but ≥ 4 already → LIMIT_REACHED.
 *   - Holders exist but no APPROVED exception for (field, value, role) →
 *     NEEDS_APPROVAL.
 *   - Otherwise → available (approved exception present).
 */
export async function checkIdentityAvailability(input: {
  fieldKey: IdentityFieldKey;
  value: string;
  role: Role;
  excludeUserId?: string;
}): Promise<IdentityAvailability> {
  const holders = await findIdentityHolders(input.fieldKey, input.value, input.excludeUserId);
  if (holders.length === 0) return { ok: true, holders };

  if (holders.some((h) => h.role === input.role)) {
    return { ok: false, reason: "TIER_TAKEN", holders };
  }
  if (holders.length >= MAX_IDENTITY_SHARES) {
    return { ok: false, reason: "LIMIT_REACHED", holders };
  }

  const approved = await prisma.identityException.findFirst({
    where: {
      field: IDENTITY_FIELD_MAP[input.fieldKey],
      value: input.value,
      role: input.role,
      status: "APPROVED",
    },
    select: { id: true },
  });
  if (!approved) return { ok: false, reason: "NEEDS_APPROVAL", holders };

  return { ok: true, holders };
}

/** Human-readable 409 message for a blocked availability result. */
export function identityDuplicateMessage(
  fieldKey: IdentityFieldKey,
  reason: "TIER_TAKEN" | "NEEDS_APPROVAL" | "LIMIT_REACHED"
): string {
  const label = IDENTITY_FIELD_LABELS[fieldKey];
  switch (reason) {
    case "TIER_TAKEN":
      return `Another account of the same type is already registered with this ${label}.`;
    case "LIMIT_REACHED":
      return `This ${label} has already reached the maximum of ${MAX_IDENTITY_SHARES} linked accounts.`;
    case "NEEDS_APPROVAL":
      return `This ${label} is already registered with another account. Master-admin approval is required to link a new account with the same ${label}.`;
  }
}

/**
 * Record a PENDING exception request when onboarding is blocked by a duplicate
 * that could be approved (NEEDS_APPROVAL). Idempotent: it will not create a
 * second identical pending row for the same (field, value, role, invite/user).
 * Returns the exception id when created or already pending, null otherwise.
 */
export async function requestIdentityException(input: {
  fieldKey: IdentityFieldKey;
  value: string;
  role: Role;
  inviteId?: string | null;
  userId?: string | null;
  linkedUserId?: string | null;
  requestedById?: string | null;
  reason?: string;
}): Promise<string | null> {
  const field = IDENTITY_FIELD_MAP[input.fieldKey];

  // If a row already exists for this (field, value, role) in a non-rejected
  // state, reuse it (the @@unique guarantees at most one).
  const existing = await prisma.identityException.findUnique({
    where: { field_value_role: { field, value: input.value, role: input.role } },
    select: { id: true, status: true },
  });
  if (existing) {
    // Re-open a rejected/revoked request as PENDING if onboarding is retried.
    if (existing.status === "REJECTED" || existing.status === "REVOKED") {
      await prisma.identityException.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          inviteId: input.inviteId ?? undefined,
          userId: input.userId ?? undefined,
          linkedUserId: input.linkedUserId ?? undefined,
          requestedById: input.requestedById ?? undefined,
          reason: input.reason ?? "Duplicate identity onboarding request",
        },
      });
    }
    return existing.id;
  }

  const created = await prisma.identityException.create({
    data: {
      field,
      value: input.value,
      role: input.role,
      inviteId: input.inviteId ?? null,
      userId: input.userId ?? null,
      linkedUserId: input.linkedUserId ?? null,
      requestedById: input.requestedById ?? null,
      status: "PENDING",
      reason: input.reason ?? "Duplicate identity onboarding request",
    },
  });
  return created.id;
}
