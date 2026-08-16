import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/**
 * Voice endpoints. These bypass the generic {@link fetchApi} helper because the
 * speech endpoint returns binary audio (not JSON), and transcription posts a
 * raw multipart file. Both hit the central-server pass-through, never the AI
 * service directly. The models and voices they accept come from
 * {@link audioRoute.getAudioCapabilities}, which is a plain JSON route.
 */
const audioEndpoints = {
  TRANSCRIBE: `${BASE_URL_SERVER}/audio/transcriptions`,
  SPEECH: `${BASE_URL_SERVER}/audio/speech`,
};

/** Map a MediaRecorder blob MIME type to a filename extension the decoder can hint off. */
function extensionForBlob(blob: Blob): string {
  if (blob.type.includes("mp4")) return "mp4";
  if (blob.type.includes("ogg")) return "ogg";
  if (blob.type.includes("wav")) return "wav";
  return "webm";
}

/**
 * Upload a recorded audio clip and return its transcript. `model` is an STT repo id from
 * {@link audioRoute.getAudioCapabilities}; omit it to use the AI core's own default.
 */
async function transcribe(blob: Blob, opts?: { model?: string; signal?: AbortSignal }): Promise<string> {
  const form = new FormData();
  form.append("file", blob, `recording.${extensionForBlob(blob)}`);
  if (opts?.model) form.append("model", opts.model);

  const res = await rawFetch(
    audioEndpoints.TRANSCRIBE,
    { method: "POST", body: form, signal: opts?.signal },
    "Transcription failed",
  );

  const json = await res.json().catch(() => null);
  return json?.data?.text ?? "";
}

/**
 * Synthesize speech for the given text and return a playable audio Blob. Each option falls back to
 * the AI core's default when omitted.
 */
async function synthesize(
  input: string,
  opts?: { voice?: string; langCode?: string; speed?: number; signal?: AbortSignal },
): Promise<Blob> {
  const res = await rawFetch(
    audioEndpoints.SPEECH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, voice: opts?.voice, langCode: opts?.langCode, speed: opts?.speed }),
      signal: opts?.signal,
    },
    "Speech synthesis failed",
  );
  return res.blob();
}

export const audioApi = { transcribe, synthesize };
