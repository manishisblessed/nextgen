-- Flip per-user service access from a denylist (disabledServices) to a
-- default-disabled allowlist (enabledServices). Intentionally NO backfill:
-- every user starts with zero enabled services until an admin enables them.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "enabledServices" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" DROP COLUMN "disabledServices";
