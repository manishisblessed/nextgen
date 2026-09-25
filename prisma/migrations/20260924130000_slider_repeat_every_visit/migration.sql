-- Slider/Pop-up: allow a pop-up to re-appear on every page load/refresh.
-- Fully ADDITIVE, non-destructive: one defaulted boolean column on "Slider".
-- Existing rows backfill to false (keep the "shown once per user" behavior).

ALTER TABLE "Slider" ADD COLUMN "repeatEveryVisit" BOOLEAN NOT NULL DEFAULT false;
