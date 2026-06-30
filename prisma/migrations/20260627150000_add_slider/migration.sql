-- Slides / Pop-up Management — homepage/dashboard banners & pop-ups.
-- Additive, non-destructive: one new enum, one new table + indexes, one FK to "User".

-- CreateEnum
CREATE TYPE "SliderKind" AS ENUM ('SLIDE', 'POPUP');

-- CreateTable
CREATE TABLE "Slider" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imagePublicId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "kind" "SliderKind" NOT NULL DEFAULT 'SLIDE',
    "audienceRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Slider_kind_active_idx" ON "Slider"("kind", "active");

-- AddForeignKey
ALTER TABLE "Slider" ADD CONSTRAINT "Slider_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
