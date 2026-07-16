-- Unified scheme: MDR pricing folds into Scheme (no separate MdrScheme model).
-- MdrSlab now belongs to a Scheme; users are priced by a single User.schemeId.

-- 1) Materialize each existing MdrScheme as a Scheme, KEEPING its id so the
--    MdrSlab.schemeId values stay valid. Name is suffixed with the id to avoid
--    colliding with the unique Scheme.name constraint. isDefault forced false
--    (a service scheme may already be the default).
INSERT INTO "Scheme" ("id", "name", "description", "active", "isDefault", "createdById", "ownerId", "parentSchemeId", "createdAt", "updatedAt")
SELECT
  "id",
  "name" || ' [MDR:' || "id" || ']',
  "description",
  "active",
  false,
  "createdById",
  "ownerId",
  NULL,
  "createdAt",
  "updatedAt"
FROM "MdrScheme"
ON CONFLICT ("id") DO NOTHING;

-- 2) Repoint the MdrSlab foreign key from MdrScheme to Scheme.
ALTER TABLE "MdrSlab" DROP CONSTRAINT IF EXISTS "MdrSlab_schemeId_fkey";
ALTER TABLE "MdrSlab" ADD CONSTRAINT "MdrSlab_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "Scheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Drop the separate per-user MDR assignment (now via User.schemeId only).
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_mdrSchemeId_fkey";
DROP INDEX IF EXISTS "User_mdrSchemeId_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "mdrSchemeId";

-- 4) Drop the now-unused MdrScheme table (its indexes + self-FK go with it).
ALTER TABLE "MdrScheme" DROP CONSTRAINT IF EXISTS "MdrScheme_parentSchemeId_fkey";
DROP TABLE IF EXISTS "MdrScheme";
