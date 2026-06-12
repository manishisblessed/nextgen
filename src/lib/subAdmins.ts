"use client";

/**
 * Browser-side store for Admin-managed Sub-Admin accounts.
 *
 * In production this would be replaced by API calls to a Postgres-backed
 * `users` table with role='sub-admin'. For the demo, sub-admins live in
 * `localStorage` so the create -> first-login -> change-password flow is
 * fully exercisable end to end.
 */

const STORE_KEY = "pp_sub_admins";

export type SubAdminStatus = "Active" | "Suspended";

export type SubAdminRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** SHA-256 hash of the current password. */
  passwordHash: string;
  /**
   * True until the user has performed their first password change.
   * When true, login should redirect to /sub-admin/change-password.
   */
  mustChangePassword: boolean;
  status: SubAdminStatus;
  createdBy: string;
  createdAt: number;
  lastLoginAt?: number;
  lastPasswordChangeAt?: number;
};

/* ----------------------------------------------------------------------- */
/*  Hashing                                                                */
/* ----------------------------------------------------------------------- */

export async function hashPassword(plain: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return `plain:${plain}`;
  }
  const data = new TextEncoder().encode(plain);
  const buf = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return (await hashPassword(plain)) === hash;
}

/* ----------------------------------------------------------------------- */
/*  Storage                                                                */
/* ----------------------------------------------------------------------- */

function read(): SubAdminRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SubAdminRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rows: SubAdminRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(rows));
}

export function listSubAdmins(): SubAdminRecord[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function findSubAdminByEmail(email: string): SubAdminRecord | undefined {
  const t = email.trim().toLowerCase();
  return read().find((u) => u.email.toLowerCase() === t);
}

function nextId(rows: SubAdminRecord[]): string {
  const used = new Set(rows.map((r) => r.id));
  let n = 1001 + rows.length;
  let id = `JNPS${n}`;
  while (used.has(id)) {
    n += 1;
    id = `JNPS${n}`;
  }
  return id;
}

export type CreateSubAdminInput = {
  name: string;
  email: string;
  phone: string;
  plainPassword: string;
  createdBy: string;
};

export async function createSubAdmin(
  input: CreateSubAdminInput
): Promise<SubAdminRecord> {
  const rows = read();
  if (
    rows.some(
      (u) => u.email.toLowerCase() === input.email.trim().toLowerCase()
    )
  ) {
    throw new Error("A sub-admin with that email already exists.");
  }

  const record: SubAdminRecord = {
    id: nextId(rows),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    passwordHash: await hashPassword(input.plainPassword),
    mustChangePassword: true,
    status: "Active",
    createdBy: input.createdBy,
    createdAt: Date.now()
  };

  write([record, ...rows]);
  return record;
}

export async function changeSubAdminPassword(
  email: string,
  newPlainPassword: string
): Promise<SubAdminRecord> {
  const rows = read();
  const idx = rows.findIndex(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (idx === -1) throw new Error("Sub-admin not found.");

  rows[idx] = {
    ...rows[idx],
    passwordHash: await hashPassword(newPlainPassword),
    mustChangePassword: false,
    lastPasswordChangeAt: Date.now()
  };
  write(rows);
  return rows[idx];
}

export function setSubAdminStatus(
  email: string,
  status: SubAdminStatus
): SubAdminRecord | undefined {
  const rows = read();
  const idx = rows.findIndex(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (idx === -1) return undefined;
  rows[idx] = { ...rows[idx], status };
  write(rows);
  return rows[idx];
}

export function recordLogin(email: string) {
  const rows = read();
  const idx = rows.findIndex(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (idx === -1) return;
  rows[idx] = { ...rows[idx], lastLoginAt: Date.now() };
  write(rows);
}

export function deleteSubAdmin(email: string) {
  const rows = read().filter(
    (u) => u.email.toLowerCase() !== email.toLowerCase()
  );
  write(rows);
}
