import type { InferenceParams } from "@/modules/chat/types";

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
