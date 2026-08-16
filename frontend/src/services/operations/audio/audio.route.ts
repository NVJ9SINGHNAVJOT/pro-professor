import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const audioEndPoints = {
  GET_MODELS: `${BASE_URL_SERVER}/audio/models`,
};

/** One selectable speech-to-text model. */
export interface SttModel {
  /** HuggingFace repo id — what a transcription request sends as `model`. */
  id: string;
  /** Loader package: `mlx-whisper` or `mlx-audio`. */
  backend: string | null;
  /** Whether the weights are in the AI core's local cache; an unprepared model can't transcribe. */
  ready: boolean;
  loaded: boolean;
  acceptsLanguageHint: boolean;
  languages: string[] | null;
}

export interface AudioCapabilities {
  stt: {
    /** The AI core's own default, used when a request names no model. */
    defaultModel: string;
    models: SttModel[];
  };
  tts: {
    model: string;
    /** Whether the weights *and* voice packs are cached. */
    ready: boolean;
    loaded: boolean;
    defaultVoice: string;
    defaultLangCode: string;
    voices: string[];
    langCodes: { code: string; label: string }[];
    speed: { min: number; max: number; defaultSpeed: number };
    responseFormats: string[];
  };
}

export type GetAudioCapabilitiesResponse = { message: string; data: AudioCapabilities };

/**
 * What the AI core's audio endpoints offer — the STT models and TTS voices/languages the voice
 * settings choose from. Loads no models on the AI core, so it is safe to fetch on page load.
 */
export const audioRoute = {
  getAudioCapabilities: createRoute<[], GetAudioCapabilitiesResponse>(() => ({
    method: "GET",
    url: audioEndPoints.GET_MODELS,
  })),
};
