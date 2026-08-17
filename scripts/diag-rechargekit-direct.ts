// Read-only diagnostic for the RechargeKit DIRECT rail ("Offline CC Bill Payment").
//   Run (MUST run from the whitelisted server, e.g. EC2 65.0.202.152):
//     npx tsx scripts/diag-rechargekit-direct.ts
//
// Verifies the runtime prerequisites without printing any secrets:
//   1. The `rechargekit_direct` ServiceRoute row exists and is enabled.
//   2. RECHARGEKIT_DIRECT_API_TOKEN is configured.
//   3. LIVE operator fetch works (proves the token + IP whitelist are good).
//   4. At least one active scheme has a BILL_CREDIT_CARD slab matchable for
//      this product scope (so charges/commission resolve).
//   5. How many retailers can transact today (scheme + allowlist).
import "./_load-env";
import { PrismaClient } from "@prisma/client";
import {
  rechargekitDirectConfigured,
  rechargekitDirectOperators,
} from "../src/lib/partners/rechargekit-direct";
import { normalizeProviderTag } from "../src/lib/scheme/resolver";

const prisma = new PrismaClient();

function line(label: string, ok: boolean, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n=== RechargeKit DIRECT / Offline CC Bill Payment diagnostic ===\n");

  // 1. Service route row
  const route = await prisma.serviceRoute.findUnique({
    where: { key: "rechargekit_direct" },
    select: { name: true, enabled: true, type: true, kind: true },
  });
  line(
    "ServiceRoute rechargekit_direct exists & enabled",
    !!route && route.enabled && route.type === "SERVICE",
    route
      ? `name="${route.name}", enabled=${route.enabled}, type=${route.type}, kind=${route.kind}`
      : "row not found — run: npm run db:seed:services"
  );

  // 2. Token (presence only, never printed)
  line(
    "RECHARGEKIT_DIRECT_API_TOKEN configured",
    rechargekitDirectConfigured(),
    rechargekitDirectConfigured()
      ? "token present"
      : "set RECHARGEKIT_DIRECT_API_TOKEN + PARTNER_RECHARGEKIT_DIRECT_ENABLED=true"
  );

  // 3. LIVE operator fetch — proves token + IP whitelist from THIS host.
  const ops = await rechargekitDirectOperators(true);
  if (ops.ok) {
    line(
      "LIVE operator fetch (token + IP whitelist OK)",
      ops.data.length > 0,
      `${ops.data.length} operator(s) returned`
    );
    if (ops.data.length > 0) {
      console.log("\n   Sample operators:");
      for (const op of ops.data.slice(0, 8)) {
        console.log(`     · [${op.operatorCode}] ${op.operatorName}${op.serviceName ? ` (${op.serviceName})` : ""}`);
      }
      if (ops.data.length > 8) console.log(`     … +${ops.data.length - 8} more`);
    }
  } else {
    line(
      "LIVE operator fetch (token + IP whitelist OK)",
      false,
      `${ops.code}: ${ops.message} — if "IPs are not Whitelisted", run this ON the whitelisted server`
    );
  }

  // 4. BILL_CREDIT_CARD slabs on active schemes, matchable for this scope.
  //    Direct rail prices under "rechargekit_direct"; falls back to SAMEDAY family.
  const slabs = await prisma.schemeSlab.findMany({
    where: { service: "BILL_CREDIT_CARD", active: true, scheme: { active: true } },
    select: {
      minAmount: true,
      maxAmount: true,
      provider: true,
      chargeType: true,
      chargeValue: true,
      commissionType: true,
      commissionValue: true,
      scheme: { select: { id: true, name: true } },
    },
    orderBy: [{ schemeId: "asc" }, { minAmount: "asc" }],
  });

  const matchable = slabs.filter(
    (s) =>
      s.provider == null ||
      s.provider === "rechargekit_direct" ||
      normalizeProviderTag(s.provider) === "SAMEDAY"
  );
  line(
    "BILL_CREDIT_CARD slab matchable for this rail exists",
    matchable.length > 0,
    matchable.length > 0
      ? `${matchable.length} slab(s) across ${new Set(matchable.map((s) => s.scheme.id)).size} active scheme(s)`
      : "no slab — charges resolve to ₹0 until a BILL_CREDIT_CARD slab is added (pin to rechargekit_direct or SAMEDAY)"
  );

  if (matchable.length > 0) {
    console.log("\n   Matchable slabs:");
    for (const s of matchable) {
      console.log(
        `     · ${s.scheme.name}: ₹${s.minAmount}-₹${s.maxAmount} | provider=${s.provider ?? "ANY"} | ` +
          `charge ${s.chargeType} ${s.chargeValue} | comm ${s.commissionType} ${s.commissionValue}`
      );
    }
  }

  // 5. Retailers attached to a scheme that has a matchable slab
  const schemeIdsWithSlab = Array.from(new Set(matchable.map((s) => s.scheme.id)));
  const retailersReady = schemeIdsWithSlab.length
    ? await prisma.user.count({
        where: { role: "RETAILER", deletedAt: null, schemeId: { in: schemeIdsWithSlab } },
      })
    : 0;
  const retailersTotal = await prisma.user.count({
    where: { role: "RETAILER", deletedAt: null },
  });
  line(
    "Retailers attached to a scheme that prices this rail",
    retailersReady > 0,
    `${retailersReady}/${retailersTotal} retailer(s) ready`
  );

  // 6. Retailers with the rail in their per-user allowlist (or unrestricted)
  const restricted = await prisma.user.count({
    where: {
      role: "RETAILER",
      deletedAt: null,
      enabledServices: { isEmpty: false },
      NOT: { enabledServices: { has: "rechargekit_direct" } },
    },
  });
  line(
    "Retailer per-user allowlist won't hide the rail",
    true,
    restricted === 0
      ? "no restricted retailers hide it"
      : `${restricted} retailer(s) have a restricted list WITHOUT rechargekit_direct — enable it in Manage Services`
  );

  console.log("\n=== end ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
