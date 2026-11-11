-- AlterEnum: Add NEEDS_REVIEW to TxnStatus
-- A transaction in NEEDS_REVIEW is parked after an INDETERMINATE partner
-- response (network loss / HTTP 5xx / timeout) on a recon-capable rail
-- (BBPS / RechargeKit). Funds are HELD — not refunded — until the provider
-- status API or an admin resolver confirms the true outcome.
-- Note: ALTER TYPE … ADD VALUE cannot run inside a transaction block in
-- PostgreSQL < 12; Prisma will apply this migration outside a transaction.
ALTER TYPE "TxnStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
