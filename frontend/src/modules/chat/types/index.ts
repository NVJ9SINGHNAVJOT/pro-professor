import type { ModelProvider } from "@/services/operations/models/models.route";
import type { MediaAttachment } from "@/services/operations/media/media.api";

export interface ChatMetricsData {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  evalRate: number | null;
  totalDurationS: number | null;
}

export interface UiMessage {
  role: "user" | "assistant" | "error";
  content: string;
  attachments?: MediaAttachment[];
  /** Streamed reasoning for a thinking-capable model (live-only; not persisted). */
  thinking?: string;
  /** Token/timing data shown when verbose was enabled for this turn. */
  metrics?: ChatMetricsData;
}

export interface SelectedModel {
  provider: ModelProvider;
  model: string;
  inputModalities: string[];
  maxContextTokens: number | null;
  supportsThinking: boolean;
}

/** Per-request inference settings the user can tune in the chat settings panel. */
export interface InferenceParams {
  maxTokens: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
}

/** Defaults mirror the AI service's built-in fallbacks. */
export const DEFAULT_INFERENCE_PARAMS: InferenceParams = {
  maxTokens: 20000,
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
};

/** Hard ceiling for max_tokens, matching the AI service's request validation. */
export const MAX_TOKENS_LIMIT = 32768;

export type Group = "Today" | "Yesterday" | "Previous 7 Days" | "Previous 30 Days" | "Older";
