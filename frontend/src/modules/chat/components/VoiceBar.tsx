import { useEffect, useRef } from "react";
import { Loader2Icon, SquareIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

/** Pick the first MediaRecorder MIME type the browser supports (Chrome: webm, Safari: mp4). */
function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

export type VoiceMode = "recording" | "thinking" | "speaking";

interface VoiceBarProps {
  mode: VoiceMode;
  /** The TTS audio element to visualize while speaking. */
  playbackAudio: HTMLAudioElement | null;
  /** One complete recorded utterance (fired when the user taps stop). */
  onRecorded: (blob: Blob) => void;
  /** Stop the currently playing reply. */
  onStopSpeaking: () => void;
  /** Leave voice mode without sending. */
  onCancel: () => void;
}

/**
 * Inline replacement for the input row while in voice mode. Shows a mic-reactive
 * black/white waveform while recording, a spinner while the pipeline works, and
 * a colorful audio-reactive waveform while the assistant's reply plays back.
 */
const VoiceBar = ({ mode, playbackAudio, onRecorded, onStopSpeaking, onCancel }: VoiceBarProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);

  const teardown = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startDraw = (variant: "mono" | "color") => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!analyser || !canvas || !ctx) return;
    const buffer = new Uint8Array(analyser.fftSize);

    const render = () => {
      analyser.getByteTimeDomainData(buffer);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      if (variant === "color") {
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, "#22d3ee");
        grad.addColorStop(0.5, "#3b82f6");
        grad.addColorStop(1, "#a855f7");
        ctx.strokeStyle = grad;
      } else {
        ctx.strokeStyle = "rgba(229, 229, 229, 0.85)";
      }
      ctx.beginPath();
      const slice = width / buffer.length;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] / 128 - 1;
        const x = i * slice;
        const y = height / 2 + (v * height) / 2.2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
  };

  // Recording: capture the mic and visualize it as a mono waveform.
  useEffect(() => {
    if (mode !== "recording") return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
        startDraw("mono");

        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        discardRef.current = false;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
          teardown();
          if (!discardRef.current && blob.size > 0) onRecorded(blob);
        };
        recorder.start();
        recorderRef.current = recorder;
      } catch {
        toast.error("Microphone access denied");
        onCancel();
      }
    })();

    return () => {
      cancelled = true;
      discardRef.current = true; // leaving record mode must not send a half-recording
      try {
        recorderRef.current?.stop();
      } catch {
        /* already stopped */
      }
      recorderRef.current = null;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Speaking: route the playing reply through an analyser and visualize it.
  useEffect(() => {
    if (mode !== "speaking" || !playbackAudio) return;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    void ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    try {
      const source = ctx.createMediaElementSource(playbackAudio);
      source.connect(analyser);
      source.connect(ctx.destination);
    } catch {
      /* element already wired to a context — visualize without rerouting */
    }
    analyserRef.current = analyser;
    startDraw("color");

    return () => teardown();
  }, [mode, playbackAudio]);

  const handleStopRecording = () => {
    discardRef.current = false;
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recorderRef.current = null;
  };

  return (
    <div className="flex items-center gap-x-2 rounded-3xl bg-chat-input px-3 py-2 shadow-lg">
      {mode === "thinking" ? (
        <div className="flex h-10 flex-1 items-center gap-x-2 px-2 text-neutral-400">
          <Loader2Icon className="size-4 animate-spin" />
          <span className="para-small-medium">Thinking…</span>
        </div>
      ) : (
        <canvas ref={canvasRef} width={1200} height={64} className="h-10 flex-1" />
      )}

      {mode === "recording" && (
        <>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel voice input"
            className="cursor-pointer rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            <XIcon className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={handleStopRecording}
            aria-label="Stop and send"
            className="cursor-pointer rounded-full bg-linear-to-br from-white to-neutral-400 p-2.5 text-black transition-all hover:scale-105"
          >
            <SquareIcon className="size-4 fill-current" />
          </button>
        </>
      )}

      {mode === "thinking" && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="cursor-pointer rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
        >
          <XIcon className="size-4.5" />
        </button>
      )}

      {mode === "speaking" && (
        <button
          type="button"
          onClick={onStopSpeaking}
          aria-label="Stop playback"
          className="cursor-pointer rounded-full bg-white p-2.5 text-black transition-transform hover:scale-105"
        >
          <SquareIcon className="size-4 fill-current" />
        </button>
      )}
    </div>
  );
};

export default VoiceBar;
