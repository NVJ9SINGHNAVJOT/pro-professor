import type { ModelProvider } from "@/services/operations/models/models.route";

export const MAX_TEXTAREA_HEIGHT_PX = 160; // ~6 rows
export const AUTOSCROLL_THRESHOLD_PX = 80;

/**
 * Smooth-reveal tuning. Tokens arrive from the network in uneven bursts, so instead of painting
 * them as they land we reveal the received text toward the user on a requestAnimationFrame loop,
 * advancing a character cursor each frame. The step is a fraction of the un-revealed backlog, so
 * it speeds up when behind and eases to a readable pace as it catches up — decoupling the reveal
 * from network jitter, the way ChatGPT/Gemini read.
 */
export const STREAM_REVEAL_DIVISOR = 6; // backlog fraction revealed per frame; higher = gentler/slower
export const STREAM_MIN_CHARS_PER_FRAME = 2; // floor so the reveal never stalls on a small backlog

export const GROUPS = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"] as const;

// Slider bounds ({ min, max, step }) for each tunable inference param.
export const MAX_TOKENS_SLIDER = { min: 500, step: 500 };
export const TEMPERATURE_SLIDER = { min: 0, max: 2, step: 0.05 };
export const TOP_P_SLIDER = { min: 0, max: 1, step: 0.05 };
export const REPETITION_PENALTY_SLIDER = { min: 1, max: 2, step: 0.05 };

/** Max images attachable to one turn — base64 inflates the request and small VLMs degrade past a couple. */
export const MAX_IMAGES = 2;

/** Number of bars rendered in the VoiceBar waveform visualizer. */
export const VOICE_BAR_COUNT = 80;

/** Characters that mark text inside `$…$` as a LaTeX expression rather than plain prose/currency. */
export const MATH_HINT = /[\\{}^_]/;

/** Friendly labels for the inference params, used to render legacy JSON settings markers. */
export const SETTINGS_FIELD_LABELS: Record<string, string> = {
  maxTokens: "Max tokens",
  temperature: "Temperature",
  topP: "Top P",
  repetitionPenalty: "Repetition penalty",
};

/** Composite key separator used to encode `provider::model` into a single Select value. */
export const MODEL_SEPARATOR = "::";

/** Display metadata per model provider — label and badge color. */
export const PROVIDER_META: Record<ModelProvider, { label: string; className: string }> = {
  "ai-service": { label: "AI Service", className: "bg-emerald-900/60 text-emerald-300" },
  ollama: { label: "Ollama", className: "bg-sky-900/60 text-sky-300" },
};

/** Determines the order providers appear in the model dropdown. */
export const PROVIDER_ORDER: ModelProvider[] = ["ai-service", "ollama"];
