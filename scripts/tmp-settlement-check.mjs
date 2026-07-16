// Temporary read-only settlement rail check (deleted after use).
import crypto from "crypto";
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

const base = process.env.SAMEDAY_POS_BASE_URL || "https://api.samedaysolution.in";
const key = process.env.SAMEDAY_SETTLEMENT_API_KEY || process.env.SAMEDAY_POS_API_KEY;
const secret = process.env.SAMEDAY_SETTLEMENT_API_SECRET || process.env.SAMEDAY_POS_API_SECRET;

async function get(path) {
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update("" + ts).digest("hex");
  const res = await fetch(`${base}${path}`, {
    headers: { "x-api-key": key, "x-signature": sig, "x-timestamp": ts },
  });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, json };
}

const balance = await get("/api/partner/settlement/balance");
console.log("balance:", balance.http, JSON.stringify(balance.json));

const charges = await get("/api/partner/settlement/charges?amount=1000&mode=IMPS");
console.log("charges:", charges.http, JSON.stringify(charges.json));

const accounts = await get("/api/partner/settlement/accounts");
const a = accounts.json;
console.log(
  "accounts:",
  accounts.http,
  `success=${a.success} count=${Array.isArray(a.accounts) ? a.accounts.length : "n/a"}`
);

const list = await get("/api/partner/settlement/status?list=true&limit=5");
const l = list.json;
console.log(
  "transactions:",
  list.http,
  `success=${l.success} count=${Array.isArray(l.transactions) ? l.transactions.length : "n/a"}`
);
