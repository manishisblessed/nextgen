import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const num = (d) => (d == null ? null : Number(d));

const uid = "cmrf7avo40001tsg3e25pjmya"; // retailer Manish Shah (machine tid 91975745)
const u = await p.user.findUnique({
  where: { id: uid },
  select: { id: true, name: true, role: true, status: true, schemeId: true, instantSettlement: true, parentId: true },
});
console.log("USER:", JSON.stringify(u));

if (u?.schemeId) {
  const scheme = await p.scheme.findUnique({
    where: { id: u.schemeId },
    select: { id: true, name: true, active: true, isDefault: true },
  });
  console.log("SCHEME:", JSON.stringify(scheme));

  const kinds = await p.mdrSlab.groupBy({
    by: ["serviceKind", "active"],
    where: { schemeId: u.schemeId },
    _count: true,
  });
  console.log("SLAB KINDS:", JSON.stringify(kinds.map((k) => ({ serviceKind: k.serviceKind, active: k.active, n: k._count }))));

  const pos = await p.mdrSlab.findMany({
    where: { schemeId: u.schemeId, serviceKind: "POS" },
    select: {
      active: true, paymentMode: true, minAmount: true, maxAmount: true,
      mdrType: true, mdrValue: true, mdrValueT0: true,
      company: true, cardType: true, brandType: true, classification: true,
    },
    orderBy: { minAmount: "asc" },
  });
  console.log("POS SLABS (" + pos.length + "):");
  for (const s of pos) {
    console.log("  " + JSON.stringify({
      active: s.active, paymentMode: s.paymentMode,
      band: `${num(s.minAmount)}-${num(s.maxAmount)}`,
      mdr: `${s.mdrType} ${num(s.mdrValue)} (T0 ${num(s.mdrValueT0)})`,
      company: s.company, cardType: s.cardType, brandType: s.brandType, classification: s.classification,
    }));
  }
} else {
  console.log("USER HAS NO schemeId");
}

await p.$disconnect();
