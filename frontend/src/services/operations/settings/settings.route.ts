import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";
import type { InferenceParams } from "@/modules/chat/types";

const settingsEndPoints = {
  GET: `${BASE_URL_SERVER}/settings`,
  UPDATE: `${BASE_URL_SERVER}/settings`,
};

/** Global default inference params. Applied server-side to the Notes AI actions. */
export interface AppSettings {
  notes: InferenceParams;
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
