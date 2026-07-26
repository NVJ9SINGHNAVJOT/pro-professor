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

/** The storage browser's category chips: every media category, plus an unfiltered "all". */
export const CATEGORY_FILTERS = ["all", ...MEDIA_CATEGORIES] as const;

export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

/** Reads a `?category=` value, falling back to "all" for anything unrecognised. */
export const asCategoryFilter = (value: string | null): CategoryFilter =>
  CATEGORY_FILTERS.includes(value as CategoryFilter) ? (value as CategoryFilter) : "all";
