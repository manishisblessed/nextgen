/**
 * Credit-card issuer → bank-logo resolver.
 *
 * Maps the *display name* of a credit-card operator/biller (as returned by the
 * partner APIs — we never mutate those names) to a self-hosted SVG logo under
 * `/public${BANK_LOGO_DIR}`. Matching is case-insensitive and tolerant of extra
 * spaces, punctuation, and the common noise words ("CREDIT CARD", "ONE",
 * "CARD", "LIMITED", "BANK", etc.).
 *
 * Isomorphic (no server/client-only imports) so the UI component, the report
 * avatar cell and any seed script can all share one source of truth.
 *
 * Returns `null` when no confident match exists — callers fall back to the
 * generic credit-card icon.
 */

/** Public sub-directory (served from /public) where the bank logos live. */
export const BANK_LOGO_DIR = "/bank-logos";

type LogoRule = {
  /** File slug → `${BANK_LOGO_DIR}/${slug}.svg`. */
  slug: string;
  /**
   * Space-normalised, lower-cased whole-word phrases to match against the
   * normalised operator name. More specific phrases should be listed first.
   */
  patterns: string[];
};

/**
 * ORDER MATTERS — the first rule whose pattern matches wins. Rules that could
 * be a substring of another bank's name are deliberately ordered so the more
 * specific / disambiguating rule is evaluated first. Notable cases:
 *   • "sbm" before "sbi"                    (SBM Bank vs State Bank)
 *   • "cub"/"city union" before "union"     (City Union Bank vs Union Bank)
 *   • "iob"/"sib" before "indian bank"      (…Indian Overseas / South Indian…)
 *   • "union" + "sbi" before "boi"          (…Bank of India suffix collisions)
 */
const RULES: LogoRule[] = [
  { slug: "sbm", patterns: ["sbm"] },
  { slug: "sbi", patterns: ["sbi", "state bank of india", "state bank", "sbi card"] },
  { slug: "hdfc", patterns: ["hdfc"] },
  { slug: "icici", patterns: ["icici"] },
  { slug: "axis", patterns: ["axis"] },
  { slug: "kotak", patterns: ["kotak", "kotak mahindra"] },
  { slug: "indusind", patterns: ["indusind"] },
  { slug: "idfc", patterns: ["idfc", "idfc first"] },
  { slug: "idbi", patterns: ["idbi"] },
  { slug: "pnb", patterns: ["pnb", "punjab national"] },
  { slug: "cub", patterns: ["cub", "city union"] },
  { slug: "union", patterns: ["union bank of india", "union bank"] },
  { slug: "canara", patterns: ["canara"] },
  { slug: "federal", patterns: ["federal"] },
  { slug: "dhanlaxmi", patterns: ["dhanlaxmi", "dhanlakshmi", "dhanalakshmi"] },
  { slug: "esaf", patterns: ["esaf"] },
  { slug: "iob", patterns: ["iob", "indian overseas"] },
  { slug: "sib", patterns: ["sib", "south indian"] },
  { slug: "indian-bank", patterns: ["indian bank"] },
  { slug: "bob", patterns: ["bob", "bob card", "bank of baroda", "baroda"] },
  { slug: "boi", patterns: ["boi", "bank of india"] },
  { slug: "bandhan", patterns: ["bandhan"] },
  { slug: "csb", patterns: ["csb", "catholic syrian"] },
  { slug: "dcb", patterns: ["dcb"] },
  { slug: "jnk", patterns: ["j k bank", "jammu", "kashmir"] },
  { slug: "suryoday", patterns: ["suryoday"] },
  { slug: "tmb", patterns: ["tmb", "tamilnad mercantile", "tamilnad"] },
  { slug: "karnataka", patterns: ["karnataka"] },
  { slug: "saraswat", patterns: ["saraswat"] },
  { slug: "yes", patterns: ["yes bank"] },
  { slug: "citi", patterns: ["citi", "citibank"] },
  { slug: "dbs", patterns: ["dbs"] },
  { slug: "hsbc", patterns: ["hsbc"] },
];

/** All slugs referenced above — used by the SVG generator / asset audits. */
export const BANK_LOGO_SLUGS: string[] = [...new Set(RULES.map((r) => r.slug))];

/**
 * Normalise a name to a padded, space-delimited, lower-cased token string.
 * Punctuation (incl. "&", "-") collapses to spaces so whole-word matching is
 * reliable, e.g. `"J&K BANK  CREDIT CARD"` → `" j k bank credit card "`.
 */
function normalize(name: string): string {
  const core = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${core} `;
}

/**
 * Resolve the logo slug for an operator/bank display name, or `null` when no
 * confident match exists. Case-insensitive and tolerant of noise words.
 */
export function bankLogoSlug(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalize(name);
  if (n.trim().length === 0) return null;
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (n.includes(` ${p} `)) return rule.slug;
    }
  }
  return null;
}

/**
 * Public path to the matched bank logo (`/bank-logos/<slug>.svg`), or `null`
 * when unmatched so the caller can render the generic fallback.
 */
export function bankLogoPath(name: string | null | undefined): string | null {
  const slug = bankLogoSlug(name);
  return slug ? `${BANK_LOGO_DIR}/${slug}.svg` : null;
}
