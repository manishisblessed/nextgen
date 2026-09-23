/**
 * Generates self-hosted credit-card bank logos as clean, brand-coloured SVG
 * wordmark tiles under `public/bank-logos/`. Each file is named `<slug>.svg`
 * matching the slugs in `src/lib/bank-logos.ts`.
 *
 * These are original, distortion-free vector marks (rounded brand tile + bold
 * wordmark) — not third-party artwork — so they are safe to self-host and look
 * crisp at the 42×42 size used by the operator picker.
 *
 * Run:  node scripts/gen-bank-logos.mjs
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "bank-logos");

/**
 * Slugs whose real vector artwork already lives in `public/bank-logos/` under a
 * different filename. We copy the real logo into the requested slug instead of
 * generating a wordmark tile, and never overwrite it.
 */
const REAL_SOURCES = {
  indusind: "indus.svg", // IndusInd Bank (real logo)
  union: "ubi.svg", // Union Bank of India (real logo)
  "indian-bank": "indian.svg", // Indian Bank (real logo)
};

/** slug → [label, brand hex]. Labels are short wordmarks/monograms. */
const BANKS = {
  sbi: ["SBI", "#22409A"],
  hdfc: ["HDFC", "#004C8F"],
  icici: ["ICICI", "#AE282E"],
  axis: ["AXIS", "#97144D"],
  kotak: ["Kotak", "#ED1C24"],
  indusind: ["IndusInd", "#8A2432"],
  idbi: ["IDBI", "#006A4D"],
  idfc: ["IDFC", "#9C1D26"],
  pnb: ["PNB", "#A20E37"],
  union: ["Union", "#E4181F"],
  canara: ["Canara", "#00548E"],
  federal: ["Federal", "#F58220"],
  dhanlaxmi: ["Dhan", "#C8102E"],
  esaf: ["ESAF", "#00A551"],
  "indian-bank": ["Indian", "#1B3F8B"],
  iob: ["IOB", "#1B4E9B"],
  bob: ["BoB", "#F15A22"],
  boi: ["BOI", "#F26522"],
  bandhan: ["Bandhan", "#B01E23"],
  csb: ["CSB", "#00539F"],
  cub: ["CUB", "#C8102E"],
  dcb: ["DCB", "#005596"],
  jnk: ["J&K", "#8A1538"],
  sbm: ["SBM", "#0F4C81"],
  suryoday: ["Suryoday", "#F58220"],
  tmb: ["TMB", "#12326E"],
  sib: ["SIB", "#E1251B"],
  karnataka: ["KBL", "#EC1C24"],
  saraswat: ["Saraswat", "#00539F"],
  yes: ["YES", "#0C4DA2"],
  citi: ["Citi", "#003B70"],
  dbs: ["DBS", "#EB0029"],
  hsbc: ["HSBC", "#DB0011"],
};

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Pick a font size that keeps the wordmark inside the tile. */
function fontSize(label) {
  const len = label.length;
  if (len <= 3) return 74;
  if (len <= 4) return 62;
  if (len <= 5) return 52;
  if (len <= 6) return 44;
  if (len <= 8) return 34;
  return 28;
}

function svg(label, color) {
  const fs = fontSize(label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}">
  <rect x="8" y="8" width="184" height="184" rx="40" fill="${color}"/>
  <text x="100" y="100" fill="#ffffff" font-family="'Segoe UI',Arial,Helvetica,sans-serif" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" letter-spacing="0.5">${esc(label)}</text>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
let tiles = 0;
let real = 0;
for (const [slug, [label, color]] of Object.entries(BANKS)) {
  const dest = join(OUT_DIR, `${slug}.svg`);
  const source = REAL_SOURCES[slug];
  if (source && existsSync(join(OUT_DIR, source))) {
    copyFileSync(join(OUT_DIR, source), dest);
    real++;
  } else {
    writeFileSync(dest, svg(label, color), "utf8");
    tiles++;
  }
}
console.log(`Bank logos → ${OUT_DIR}: ${real} real, ${tiles} branded tiles`);
