// Check raw response JSON + vendor charge for CC BBPS transactions
const fs = require("fs");
const { Client } = require("pg");

const envContent = fs.readFileSync("/home/ubuntu/env-nextgenpay", "utf8");
const dbLine = envContent.split("\n").find((l) => l.replace(/\r/, "").trim().startsWith("DATABASE_URL="));
const dbUrl = dbLine.split("=").slice(1).join("=").replace(/\r/g, "").trim().replace(/^["']|["']$/g, "");
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();

  // ── Show raw partner response JSON ──
  console.log("=".repeat(70));
  console.log("Raw partner response for CC BBPS transactions");
  console.log("=".repeat(70));
  const q1 = await client.query(`
    SELECT "refId", "partnerTxnId", "partner",
           response
    FROM "Transaction"
    WHERE service = 'BILL_CREDIT_CARD'
    ORDER BY "createdAt" DESC
    LIMIT 5
  `);
  q1.rows.forEach((row) => {
    console.log(`\nrefId: ${row.refId}  partner: ${row.partner}  partnerTxnId: ${row.partnerTxnId}`);
    const res = row.response || {};
    console.log("  success:", res.success);
    console.log("  charge (SameDay fee from our wallet):", res.charge ?? res._samedayCharge ?? "NOT CAPTURED");
    console.log("  amount:", res.amount ?? res._samedayAmount ?? "NOT CAPTURED");
    console.log("  order_id:", res.order_id);
    console.log("  request_id:", res.request_id);
    console.log("  transactionId:", res.transactionId);  // BulkPe field
    console.log("  reference:", res.reference);           // BulkPe field
    console.log("  status:", res.status);
  });

  // ── Schemes with vendorCharge = 0 on CC BBPS — the loss risk ──
  console.log("\n" + "=".repeat(70));
  console.log("⚠️  RISK: Schemes with vendorCharge = 0 for CC BBPS");
  console.log("These schemes will book ZERO cost even if SameDay charges real money");
  console.log("=".repeat(70));
  const q2 = await client.query(`
    SELECT s.name as scheme, s."isDefault",
           ss."chargeType", ss."chargeValue"::numeric as our_charge,
           ss."vendorCharge"::numeric as vendor_charge,
           ss.provider,
           (SELECT COUNT(*) FROM "User" u WHERE u."schemeId" = s.id) as users_on_scheme
    FROM "SchemeSlab" ss
    JOIN "Scheme" s ON s.id = ss."schemeId"
    WHERE ss.service = 'BILL_CREDIT_CARD'
      AND ss.active = true
      AND ss."vendorCharge" = 0
    ORDER BY users_on_scheme DESC, s.name
  `);
  if (q2.rows.length === 0) {
    console.log("✅ All CC BBPS slabs have vendorCharge > 0\n");
  } else {
    console.log(`Found ${q2.rows.length} scheme(s) with vendorCharge = 0:\n`);
    console.table(q2.rows);
    console.log("\n👉 ACTION: Update these slabs with the actual SameDay/BulkPe charge.");
    console.log("   Check SameDay portal for per-txn charge OR call /api/services/bbps/charges?amount=1000");
  }

  await client.end();
  console.log("\nDone.");
}

run().catch((e) => { console.error("Error:", e.message); process.exit(1); });
