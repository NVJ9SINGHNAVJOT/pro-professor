import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const mediaEndPoints = {
  LIST: `${BASE_URL_SERVER}/media`,
  DELETE_ONE: (storageId: string) => `${BASE_URL_SERVER}/media/${storageId}`,
};

/** Storage buckets the storage-server sorts uploads into. */
export const MEDIA_CATEGORIES = ["images", "videos", "audio", "documents", "others"] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/**
 * A stored file as listed by the Settings → Storage browser. Keyed by the storage-server UUID,
 * not the media row id — the listing is filesystem-backed, so some files have no row.
 * {@link MediaFile.url} points straight at the storage-server (previews and downloads never go
 * through central-server).
 */
/**
 * Where a file is referenced. Both counts zero means it can be deleted; either non-zero means the
 * server refuses the delete with 409.
 */
export interface MediaUsage {
  /** chat messages carrying it as an attachment */
  chatMessages: number;
  /** notes embedding it as `![[file.png]]` */
  notes: number;
}

export interface MediaFile {
  storageId: string;
  url: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  category: MediaCategory;
  createdAt: string;
  usage: MediaUsage;
}

export interface MediaPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListMediaParams {
  category?: MediaCategory;
  /** `created_at` (default) or `size`. */
  sortBy?: "created_at" | "size";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export type ListMediaResponse = {
  message: string;
  data: { media: MediaFile[]; pagination: MediaPagination };
};

export type DeleteMediaResponse = { message: string };

export const mediaRoute = {
  listMedia: createRoute<[params: ListMediaParams], ListMediaResponse>((params) => ({
    method: "GET",
    url: mediaEndPoints.LIST,
    params: Object.fromEntries(
      Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
  })),

  deleteMedia: createRoute<[storageId: string], DeleteMediaResponse>((storageId) => ({
    method: "DELETE",
    url: mediaEndPoints.DELETE_ONE(storageId),
  })),
};
