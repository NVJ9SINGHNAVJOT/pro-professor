import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/**
 * Voice endpoints. These bypass the generic {@link fetchApi} helper because the
 * speech endpoint returns binary audio (not JSON), and transcription posts a
 * raw multipart file. Both hit the central-server pass-through, never the AI
 * service directly.
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

/** Upload a recorded audio clip and return its transcript. */
export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", blob, `recording.${extensionForBlob(blob)}`);

  const res = await rawFetch(audioEndpoints.TRANSCRIBE, { method: "POST", body: form, signal }, "Transcription failed");

  const json = await res.json().catch(() => null);
  return json?.data?.text ?? "";
}

/** Synthesize speech for the given text and return a playable audio Blob. */
export async function synthesizeSpeech(input: string, voice?: string, signal?: AbortSignal): Promise<Blob> {
  const res = await rawFetch(
    audioEndpoints.SPEECH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, voice }),
      signal,
    },
    "Speech synthesis failed",
  );
  return res.blob();
}
