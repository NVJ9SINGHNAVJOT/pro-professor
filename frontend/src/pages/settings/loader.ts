import type { LoaderFunctionArgs } from "react-router";
import store from "@/redux/store";
import { setAudioCapabilities, setVoiceDefaults } from "@/redux/slices/audioSlice";
import { load, loadOptional } from "@/services/client/loadRoute";
import { settingsRoute, type AppSettings } from "@/services/operations/settings/settings.route";
import { audioRoute, type GetAudioCapabilitiesResponse } from "@/services/operations/audio/audio.route";
import {
  mediaRoute,
  type MediaFile,
  type MediaPagination,
  type ListMediaParams,
} from "@/services/operations/media/media.route";
import { STORAGE_PAGE_SIZE, asCategoryFilter } from "@/modules/settings/constants";

const NO_AUDIO: GetAudioCapabilitiesResponse | null = null;

export type SettingsLoaderData = {
  /** null for sections that don't read app settings (storage browses the media service itself). */
  settings: AppSettings | null;
};

/**
 * loader for the notes and chat settings sections.
 *
 * It also refreshes the AI core's voice capabilities into `audioSlice` (optional — the settings
 * page must still open when the AI core is down). Opening Settings is therefore how the STT/voice
 * lists recover after an outage at boot, without a page reload.
 */
export async function settingsLoader({ request }: LoaderFunctionArgs): Promise<SettingsLoaderData> {
  const [response, audio] = await Promise.all([
    load(request.signal, settingsRoute.getSettings),
    loadOptional(NO_AUDIO, request.signal, audioRoute.getAudioCapabilities),
  ]);
  store.dispatch(setAudioCapabilities(audio ? audio.data : null));
  store.dispatch(setVoiceDefaults(response.data.chat));
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
