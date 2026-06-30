-- Phase 12 cache hardening: server-side session invalidation.
-- Fully additive, non-destructive: one new NOT NULL column with a default on
-- "User". Existing rows backfill to 0 automatically. Safe on a live database.

-- AlterTable: tokenVersion drives JWT invalidation (logout / privilege change).
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
