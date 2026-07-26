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

// Preset definitions for inference parameters
export interface InferencePreset {
  id: string;
  label: string;
  description: string;
  tooltip: string;
  icon: string;
  params: { temperature: number; topP: number; repetitionPenalty: number };
}

export const INFERENCE_PRESETS: InferencePreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "General conversation",
    tooltip: "A well-rounded setup for day-to-day chats, providing a good mix of creativity and focus without straying off-topic.",
    icon: "Scale",
    params: { temperature: 0.7, topP: 0.9, repetitionPenalty: 1.1 },
  },
  {
    id: "creative",
    label: "Creative",
    description: "Writing and storytelling",
    tooltip: "Boosts randomness and vocabulary diversity. Ideal for brainstorming, creative writing, and generating highly varied responses.",
    icon: "Palette",
    params: { temperature: 1.2, topP: 0.95, repetitionPenalty: 1.0 },
  },
  {
    id: "precise",
    label: "Precise",
    description: "Factual Q&A and code",
    tooltip: "Highly deterministic and focused. Best used for exact factual answers, structured data generation, and strict code writing.",
    icon: "Target",
    params: { temperature: 0.3, topP: 0.8, repetitionPenalty: 1.2 },
  },
  {
    id: "reasoning",
    label: "Reasoning",
    description: "Math and logic",
    tooltip: "Optimized for logical deduction and mathematical problem-solving, keeping the model strictly analytical while preventing loops.",
    icon: "Brain",
    params: { temperature: 0.5, topP: 0.85, repetitionPenalty: 1.15 },
  },
  {
    id: "research",
    label: "Research",
    description: "Deep analysis",
    tooltip: "Balanced for comprehensive analysis and thorough research tasks, maintaining coherence over long, detailed explanations.",
    icon: "Microscope",
    params: { temperature: 0.6, topP: 0.9, repetitionPenalty: 1.1 },
  },
];

// Slider bounds for max tokens
export const MAX_TOKENS_SLIDER = { min: 500, max: 32000, step: 500 };
export const TEMPERATURE_SLIDER = { min: 0, max: 2, step: 0.05 };
export const TOP_P_SLIDER = { min: 0, max: 1, step: 0.05 };
export const REPETITION_PENALTY_SLIDER = { min: 1, max: 2, step: 0.05 };

/** Max images attachable to one turn — base64 inflates the request and small VLMs degrade past a couple. */
export const MAX_IMAGES = 2;

/** Number of bars rendered in the VoiceBar waveform visualizer. */
export const VOICE_BAR_COUNT = 80;

/** Characters that mark text inside `$…$` as a LaTeX expression rather than plain prose/currency. */
export const MATH_HINT = /[\\{}^_]/;

/** Composite key separator used to encode `provider::model` into a single Select value. */
export const MODEL_SEPARATOR = "::";

/** Display metadata per model provider — label and badge color. */
export const PROVIDER_META: Record<ModelProvider, { label: string; className: string }> = {
  "ai-service": { label: "AI Service", className: "bg-emerald-900/60 text-emerald-300" },
  ollama: { label: "Ollama", className: "bg-sky-900/60 text-sky-300" },
};

/** Determines the order providers appear in the model dropdown. */
export const PROVIDER_ORDER: ModelProvider[] = ["ai-service", "ollama"];
