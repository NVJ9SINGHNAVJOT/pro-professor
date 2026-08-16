import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";
import type { InferenceParams, VoiceSettings } from "@/modules/chat/types";

const settingsEndPoints = {
  GET: `${BASE_URL_SERVER}/settings`,
  UPDATE: `${BASE_URL_SERVER}/settings`,
};

/**
 * Global defaults: the Notes inference params, applied server-side to the Notes AI actions, and the
 * voice settings every new conversation starts from (the chat screen reads those and applies them
 * itself when calling the audio endpoints).
 */
export interface AppSettings {
  notes: InferenceParams;
  chat: VoiceSettings;
}

export type GetSettingsResponse = { message: string; data: AppSettings };

export const settingsRoute = {
  getSettings: createRoute<[], GetSettingsResponse>(() => ({
    method: "GET",
    url: settingsEndPoints.GET,
  })),

  updateSettings: createRoute<[payload: AppSettings], GetSettingsResponse>((payload) => ({
    method: "PUT",
    url: settingsEndPoints.UPDATE,
    data: payload,
  })),
};
