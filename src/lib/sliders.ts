import { z } from "zod";

/** Valid DB Role values usable as slider audience targets. */
export const SLIDER_ROLES = [
  "RETAILER",
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
  "ADMIN",
  "SUPPORT",
  "MASTER_ADMIN",
] as const;

export const SliderRoleEnum = z.enum(SLIDER_ROLES);
export const SliderKindEnum = z.enum(["SLIDE", "POPUP"]);

/** Shape of a Slider row as returned by Prisma (the fields we serialize). */
export type SliderRow = {
  id: string;
  title: string;
  imagePublicId: string;
  imageUrl: string;
  linkUrl: string | null;
  kind: string;
  audienceRoles: string[];
  active: boolean;
  sortOrder: number;
  startAt: Date | null;
  endAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Full serialization for the admin manager (all fields). */
export function serializeSlider(s: SliderRow) {
  return {
    id: s.id,
    title: s.title,
    imagePublicId: s.imagePublicId,
    imageUrl: s.imageUrl,
    linkUrl: s.linkUrl,
    kind: s.kind,
    audienceRoles: s.audienceRoles,
    active: s.active,
    sortOrder: s.sortOrder,
    startAt: s.startAt ? s.startAt.toISOString() : null,
    endAt: s.endAt ? s.endAt.toISOString() : null,
    createdById: s.createdById,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Lean serialization for the public surface (no internal/audit fields). */
export function serializePublicSlider(s: SliderRow) {
  return {
    id: s.id,
    title: s.title,
    imageUrl: s.imageUrl,
    linkUrl: s.linkUrl,
    kind: s.kind,
    sortOrder: s.sortOrder,
  };
}

export type PublicSlider = ReturnType<typeof serializePublicSlider>;
export type AdminSlider = ReturnType<typeof serializeSlider>;
