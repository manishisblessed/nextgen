import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const num = (d) => (d == null ? null : Number(d));

// 1) Walk the RT chain up to 4 levels.
const startId = "cmrf7avo40001tsg3e25pjmya"; // Manish Shah (RETAILER)
let cur = startId;
const seen = new Set();
console.log("=== CHAIN (RT -> ancestors) ===");
for (let i = 0; i < 4 && cur && !seen.has(cur); i++) {
  seen.add(cur);
  const u = await p.user.findUnique({
    where: { id: cur },
    select: { id: true, name: true, role: true, status: true, schemeId: true, parentId: true },
  });
  if (!u) break;
  let slabInfo = "no scheme";
  if (u.schemeId) {
    const sc = await p.scheme.findUnique({ where: { id: u.schemeId }, select: { name: true, active: true } });
    const pos = await p.mdrSlab.findMany({
      where: { schemeId: u.schemeId, serviceKind: "POS", active: true },
      select: { paymentMode: true, minAmount: true, maxAmount: true, mdrType: true, mdrValue: true, company: true, cardType: true, brandType: true, classification: true },
      orderBy: { minAmount: "asc" },
    });
    slabInfo = `scheme='${sc?.name}' active=${sc?.active} posSlabs=${pos.length}`;
    console.log(`L${i} ${u.role} ${u.name} (${u.id}) schemeId=${u.schemeId} :: ${slabInfo}`);
    for (const s of pos) {
      console.log(`     ${JSON.stringify({ pm: s.paymentMode, band: `${num(s.minAmount)}-${num(s.maxAmount)}`, mdr: `${s.mdrType} ${num(s.mdrValue)}`, company: s.company, cardType: s.cardType, brandType: s.brandType, classification: s.classification })}`);
    }
  } else {
    console.log(`L${i} ${u.role} ${u.name} (${u.id}) :: NO SCHEME`);
  }
  cur = u.parentId;
}

// 2) Global: POS slabs with company pinned + collision detection if nulled.
console.log("\n=== GLOBAL POS SLAB SCAN ===");
const allPos = await p.mdrSlab.findMany({
  where: { serviceKind: "POS", active: true },
  select: { id: true, schemeId: true, paymentMode: true, minAmount: true, maxAmount: true, mdrValue: true, company: true, cardType: true, brandType: true, classification: true },
});
const pinned = allPos.filter((s) => s.company != null && s.company !== "");
console.log(`Active POS slabs: ${allPos.length}, company-pinned: ${pinned.length}`);

// Collision: after nulling company, would two active slabs in the same scheme
// share (paymentMode, cardType, brandType, classification) AND overlapping band?
const bySchemeKey = new Map();
for (const s of allPos) {
  const key = `${s.schemeId}|${s.paymentMode}|${s.cardType ?? ""}|${s.brandType ?? ""}|${s.classification ?? ""}`;
  if (!bySchemeKey.has(key)) bySchemeKey.set(key, []);
  bySchemeKey.get(key).push(s);
}
let collisions = 0;
for (const [key, group] of bySchemeKey) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      const overlap = Number(a.minAmount) <= Number(b.maxAmount) && Number(b.minAmount) <= Number(a.maxAmount);
      const differByCompanyOnly = (a.company ?? "") !== (b.company ?? "");
      if (overlap && differByCompanyOnly) {
        collisions++;
        console.log(`COLLISION scheme=${a.schemeId} key=${key} :: company ${a.company}(${num(a.mdrValue)}) vs ${b.company}(${num(b.mdrValue)}) bands ${num(a.minAmount)}-${num(a.maxAmount)} / ${num(b.minAmount)}-${num(b.maxAmount)}`);
      }
    }
}
console.log(`Collisions if company nulled: ${collisions}`);

// 3) Commission credits for the 4 synthetic POS transactions.
console.log("\n=== COMMISSION STATE (4 captures) ===");
const refs = [
  "260715164149119E886761161",
  "260714131619288E698689109",
  "260714123336739E772103852",
  "260714104946010E679542364",
];
for (const r of refs) {
  const synthRef = `POS${r.slice(-10).toUpperCase()}`;
  const txn = await p.transaction.findUnique({ where: { refId: synthRef }, select: { id: true } });
  if (!txn) { console.log(`${r} -> no synthetic txn (${synthRef})`); continue; }
  const cc = await p.commissionCredit.findMany({ where: { transactionId: txn.id }, select: { userId: true, tier: true, grossAmount: true, amount: true } });
  console.log(`${r} synth=${synthRef} txnId=${txn.id} credits=${cc.length} ${JSON.stringify(cc.map((c) => ({ tier: c.tier, gross: num(c.grossAmount), net: num(c.amount) })))}`);
}

await p.$disconnect();
