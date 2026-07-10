-- Fraud prevention: enforce one-identity-per-user across all KYC & business fields.
-- Each PAN, Aadhaar, bank account, GST, Udyam, and shop name can belong to at most
-- one user. NULL values are excluded (multiple users may have NULL for optional fields).
--
-- IMPORTANT: If duplicate data already exists, this migration will fail. Run the
-- dedup query below BEFORE applying:
--
--   SELECT "panNumber", COUNT(*) FROM "Kyc" WHERE "panNumber" IS NOT NULL GROUP BY "panNumber" HAVING COUNT(*) > 1;
--   SELECT "aadhaarNumber", COUNT(*) FROM "Kyc" WHERE "aadhaarNumber" IS NOT NULL GROUP BY "aadhaarNumber" HAVING COUNT(*) > 1;
--   SELECT "bankAccountNumber", COUNT(*) FROM "Kyc" WHERE "bankAccountNumber" IS NOT NULL GROUP BY "bankAccountNumber" HAVING COUNT(*) > 1;
--   SELECT "gstin", COUNT(*) FROM "Kyc" WHERE "gstin" IS NOT NULL GROUP BY "gstin" HAVING COUNT(*) > 1;
--   SELECT "msmeNumber", COUNT(*) FROM "Kyc" WHERE "msmeNumber" IS NOT NULL GROUP BY "msmeNumber" HAVING COUNT(*) > 1;
--   SELECT "shopName", COUNT(*) FROM "User" WHERE "shopName" IS NOT NULL GROUP BY "shopName" HAVING COUNT(*) > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Kyc_panNumber_key" ON "Kyc"("panNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Kyc_aadhaarNumber_key" ON "Kyc"("aadhaarNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Kyc_bankAccountNumber_key" ON "Kyc"("bankAccountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Kyc_gstin_key" ON "Kyc"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "Kyc_msmeNumber_key" ON "Kyc"("msmeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_shopName_key" ON "User"("shopName");
