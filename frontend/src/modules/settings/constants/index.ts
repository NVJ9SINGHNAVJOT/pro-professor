import type { InferenceParams } from "@/modules/chat/types";

/**
 * Factory defaults each settings panel's "Reset" restores. These mirror the `app_settings` DB seed:
 * Notes = Balanced (looser prose), Diagrams = Precise (lower temperature → more schema-valid patches).
 */
export const NOTES_DEFAULT_PARAMS: InferenceParams = {
  maxTokens: 20000,
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
};

export const DIAGRAM_DEFAULT_PARAMS: InferenceParams = {
  maxTokens: 20000,
  temperature: 0.3,
  topP: 0.8,
  repetitionPenalty: 1.2,
};
