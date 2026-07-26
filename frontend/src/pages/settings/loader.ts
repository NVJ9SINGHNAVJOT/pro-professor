import type { LoaderFunctionArgs } from "react-router";
import { load } from "@/services/client/loadRoute";
import { settingsRoute, type AppSettings } from "@/services/operations/settings/settings.route";
import {
  mediaRoute,
  type MediaFile,
  type MediaPagination,
  type ListMediaParams,
} from "@/services/operations/media/media.route";
import { STORAGE_PAGE_SIZE, asCategoryFilter } from "@/modules/settings/constants";

export type SettingsLoaderData = {
  /** null for sections that don't read app settings (storage browses the media service itself). */
  settings: AppSettings | null;
};

/** loader for the notes settings section */
export async function settingsLoader({ request }: LoaderFunctionArgs): Promise<SettingsLoaderData> {
  const response = await load(request.signal, settingsRoute.getSettings);
  return { settings: response.data };
}

export type StorageLoaderData = {
  media: MediaFile[];
  pagination: MediaPagination;
};

/**
 * loader for the storage section — the first page of files, filtered/sorted by the URL's search
 * params so a filter change is a navigation the loader answers (and RouteProgress reports).
 */
export async function storageLoader({ request }: LoaderFunctionArgs): Promise<StorageLoaderData> {
  const url = new URL(request.url);
  const category = asCategoryFilter(url.searchParams.get("category"));
  const sortBy = url.searchParams.get("sortBy") as ListMediaParams["sortBy"] | undefined;
  const order = url.searchParams.get("order") as ListMediaParams["order"] | undefined;

  const response = await load(request.signal, mediaRoute.listMedia, {
    category: category === "all" ? undefined : category,
    sortBy,
    order,
    limit: STORAGE_PAGE_SIZE,
    offset: 0,
  });

  return {
    media: response.data.media,
    pagination: response.data.pagination,
  };
}
