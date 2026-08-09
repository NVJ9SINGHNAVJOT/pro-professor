import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/common/toast";
import { audioApi } from "@/services/operations/audio/audio.api";
import { pickMimeType } from "@/modules/chat/utils";

/** Idle, capturing the mic, or waiting on the transcription round trip. */
export type DictationState = "idle" | "recording" | "transcribing";

/**
 * Dictation: speak, get the words in the composer, edit and send them yourself.
 *
 * Deliberately *not* voice chat ({@link VoiceBar}), which is a whole conversational mode — it sends
 * the utterance, speaks the reply back, and for an audio-capable model skips transcription entirely.
 * This is the plain speech-to-text half of that pipeline and nothing else: one `POST
 * /audio/transcriptions`, and the text is handed to the caller. Nothing is sent, nothing is spoken.
 */
export const useDictation = (onTranscript: (text: string) => void) => {
  const [state, setState] = useState<DictationState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Set by cancel (or unmount) mid-recording: the clip is then dropped rather than transcribed. */
  const discardRef = useRef(false);
  /** True between the mic click and the recorder actually starting — see {@link start}. */
  const startingRef = useRef(false);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Leaving the screen must not leave the mic light on, nor land a transcript in a composer that
  // no longer exists.
  useEffect(() => {
    return () => {
      discardRef.current = true;
      try {
        recorderRef.current?.stop();
      } catch {
        /* already stopped */
      }
      releaseMic();
    };
  }, [releaseMic]);

  const start = useCallback(async () => {
    // getUserMedia is async and `state` stays "idle" until it resolves, so a second click in that
    // window would open a second recorder and leak the first one's tracks.
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      discardRef.current = false;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        releaseMic();
        if (discardRef.current || blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        void audioApi
          .transcribe(blob)
          .then((text) => {
            const spoken = text.trim();
            if (spoken) onTranscript(spoken);
            else toast.error("Didn't catch that — please try again");
          })
          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Transcription failed"))
          .finally(() => setState("idle"));
      };
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch {
      releaseMic();
      setState("idle");
      toast.error("Microphone access denied");
    } finally {
      startingRef.current = false;
    }
  }, [onTranscript, releaseMic]);

  const stop = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped — onstop still runs the transcription */
    }
  }, []);

  /**
   * Throws the clip away instead of transcribing it — the way out of a recording you didn't mean to
   * start, mirroring voice mode's cancel. Set before `stop()` because `onstop` reads it.
   */
  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
  }, [stop]);

  /** One button drives the whole thing: press to speak, press again to transcribe. */
  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  return { state, toggle, cancel };
};
