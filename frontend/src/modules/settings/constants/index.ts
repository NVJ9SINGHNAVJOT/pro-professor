import { LayoutGridIcon, Rows3Icon, SquareIcon } from "lucide-react";
import type { InferenceParams } from "@/modules/chat/types";
import { MEDIA_CATEGORIES } from "@/services/operations/media/media.route";

/**
 * Factory defaults the settings panel's "Reset" restores. Mirrors the `app_settings` DB seed:
 * Notes = Balanced (looser prose).
 */
export const NOTES_DEFAULT_PARAMS: InferenceParams = {
  maxTokens: 20000,
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
};

/** Files per page in the storage browser — the loader's first page and every "Load more" after it. */
export const STORAGE_PAGE_SIZE = 50;

/** The storage browser's sort dropdown; each value is the `sort` query param the listing takes. */
export const SORT_OPTIONS = [
  { label: "Newest first", value: "created_at:desc" },
  { label: "Oldest first", value: "created_at:asc" },
  { label: "Largest first", value: "size:desc" },
  { label: "Smallest first", value: "size:asc" },
];

/** The storage browser's category chips: every media category, plus an unfiltered "all". */
export const CATEGORY_FILTERS = ["all", ...MEDIA_CATEGORIES] as const;

export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

/** Reads a `?category=` value, falling back to "all" for anything unrecognised. */
export const asCategoryFilter = (value: string | null): CategoryFilter =>
  CATEGORY_FILTERS.includes(value as CategoryFilter) ? (value as CategoryFilter) : "all";

/**
 * The storage browser's card sizes. Each drives the grid's column floor and the thumbnail band's
 * height together — a wider card with a short thumbnail reads as a letterbox, so the two move in
 * step. "medium" is what the grid was fixed at before the switch existed.
 */
export const STORAGE_VIEW_SIZES = [
  { size: "small", label: "Small", icon: Rows3Icon, minWidth: "140px", thumbHeight: "h-24", glyph: "size-8" },
  { size: "medium", label: "Medium", icon: SquareIcon, minWidth: "200px", thumbHeight: "h-32", glyph: "size-10" },
  { size: "large", label: "Large", icon: LayoutGridIcon, minWidth: "280px", thumbHeight: "h-44", glyph: "size-12" },
] as const;

export type StorageViewSize = (typeof STORAGE_VIEW_SIZES)[number]["size"];

/** Versioned, like every persisted view preference — see `utils/localStore.ts`. */
export const STORAGE_VIEW_SIZE_KEY = "pro-professor:storage-view-size:v1";

/** Reads a persisted size, falling back to "medium" for anything unrecognised. */
export const asViewSize = (value: unknown): StorageViewSize =>
  STORAGE_VIEW_SIZES.some((option) => option.size === value) ? (value as StorageViewSize) : "medium";
