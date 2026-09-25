-- Sequential, human-facing order number (pure integer) on every Transaction,
-- surfaced on the Bill Payment / Credit Card reports and receipts.
--
-- Strategy (additive, safe to apply while the app is running):
--   1. Add the column nullable so the backfill can run without a table rewrite.
--   2. Backfill existing rows in chronological (createdAt) order starting at 1.
--   3. Bind a sequence as the default and advance it past the current max, so
--      new rows continue seamlessly.
--   4. Enforce NOT NULL + UNIQUE.
-- Naming follows Prisma's autoincrement conventions (<Table>_<col>_seq / _key)
-- so the schema stays in sync with `orderNo Int @unique @default(autoincrement())`.

-- 1. Column (nullable first).
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "orderNo" INTEGER;

-- 2. Dedicated sequence.
CREATE SEQUENCE IF NOT EXISTS "Transaction_orderNo_seq" AS INTEGER;

-- 3. Backfill unnumbered rows in chronological order, continuing after any max.
WITH ordered AS (
  SELECT "id",
         ROW_NUMBER() OVER (ORDER BY "createdAt", "id")
           + COALESCE((SELECT MAX("orderNo") FROM "Transaction"), 0) AS n
  FROM "Transaction"
  WHERE "orderNo" IS NULL
)
UPDATE "Transaction" t SET "orderNo" = o.n FROM ordered o WHERE t."id" = o."id";

-- 4. Bind the sequence to the column and advance it past the highest value.
ALTER SEQUENCE "Transaction_orderNo_seq" OWNED BY "Transaction"."orderNo";
SELECT setval(
  '"Transaction_orderNo_seq"',
  COALESCE((SELECT MAX("orderNo") FROM "Transaction"), 1),
  (SELECT COUNT(*) > 0 FROM "Transaction")
);
ALTER TABLE "Transaction" ALTER COLUMN "orderNo" SET DEFAULT nextval('"Transaction_orderNo_seq"');
ALTER TABLE "Transaction" ALTER COLUMN "orderNo" SET NOT NULL;

-- 5. Uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_orderNo_key" ON "Transaction"("orderNo");
