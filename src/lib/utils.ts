import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function generateRefId(prefix = "TXN") {
  const date = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${date}${rand}`;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JMP NextGenPay network-code prefixes — driven by the role of the user. */
export const USER_CODE_PREFIX = {
  retailer: "JNPR",
  distributor: "JNPD",
  "master-distributor": "JNPM"
} as const;

/**
 * Generate a unique NextGenPay network code for a given role.
 *
 *   retailer            → JNPR + 6 chars  (e.g. JNPR8K2X9P)
 *   distributor         → JNPD + 6 chars
 *   master-distributor  → JNPM + 6 chars
 */
export function generateUserCode(
  role: keyof typeof USER_CODE_PREFIX
): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${USER_CODE_PREFIX[role]}${rand}`;
}

/**
 * Fuzzy name comparison for cross-document verification (Aadhaar vs PAN vs Bank).
 * Normalises casing, strips honorifics, and tolerates word reordering / minor diffs.
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .replace(
        /\b(mr|mrs|ms|shri|smt|dr|prof|kumari|sri|late)\b/g,
        ""
      )
      .trim()
      .replace(/\s+/g, " ");

  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return true;

  const wordsA = na.split(" ").filter(Boolean).sort();
  const wordsB = nb.split(" ").filter(Boolean).sort();

  if (wordsA.join(" ") === wordsB.join(" ")) return true;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = wordsA.filter((w) => setB.has(w));
  const union = new Set([...setA, ...setB]);
  const similarity = intersection.length / union.size;
  return similarity >= 0.6;
}

/** Generate a strong, human-friendly random password (10 chars, mixed case + digits). */
export function generateRandomPassword(length = 10): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$%&*";
  const all = upper + lower + digits + special;

  const pick = (set: string) =>
    set.charAt(Math.floor(Math.random() * set.length));

  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = pwd.length; i < length; i++) pwd += pick(all);

  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}
