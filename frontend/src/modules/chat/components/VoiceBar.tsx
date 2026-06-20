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

const BAR_COUNT = 80;

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

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const smoothed = new Array<number>(BAR_COUNT).fill(0);
    // Color distinguishes who's talking: cool cyan/blue while the user records,
    // the cyan → violet → pink neon ramp while the assistant speaks.
    const stops = variant === "color" ? ["#22d3ee", "#a78bfa", "#f472b6"] : ["#22d3ee", "#38bdf8", "#0ea5e9"];

    const render = () => {
      analyser.getByteFrequencyData(freq);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // one continuous gradient across the whole strip → smooth color blend
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, stops[0]);
      grad.addColorStop(0.5, stops[1]);
      grad.addColorStop(1, stops[2]);

      const gap = width / BAR_COUNT;
      const barWidth = gap * 0.32;
      const usable = freq.length * 0.7; // skip the mostly-empty high bins
      const centerY = height / 2;
      const maxHalf = height / 2 - 2;

      for (let i = 0; i < BAR_COUNT; i++) {
        const t = i / (BAR_COUNT - 1);
        // smooth bell envelope → the centre-heavy spindle shape
        const envelope = Math.pow(Math.sin(Math.PI * t), 0.8);
        // mirror the spectrum around the centre so the wave is left↔right symmetric
        const mirrored = 1 - Math.abs(t * 2 - 1);
        const magnitude = Math.min(1, (freq[Math.floor(mirrored * usable)] / 255) * 2.2); // boosted sensitivity
        smoothed[i] += (magnitude - smoothed[i]) * 0.5; // quicker, more reactive response
        const level = 0.06 + smoothed[i] * 0.94; // low idle floor → bars react strongly to sound
        const half = Math.max(barWidth / 2, level * envelope * maxHalf);
        const x = i * gap + (gap - barWidth) / 2;

        ctx.globalAlpha = 0.35 + envelope * 0.65;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, centerY - half, barWidth, half * 2, barWidth / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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
    <div className="relative">
      {/* The input box: full-width like the idle bar, with the stop button where the mic/send button sits */}
      <div className="flex items-center gap-x-2 rounded-3xl bg-chat-input px-3 py-2 shadow-lg">
        {mode === "thinking" ? (
          <div className="flex h-10 flex-1 items-center gap-x-2 px-2 text-neutral-400">
            <Loader2Icon className="size-4 animate-spin" />
            <span className="para-small-medium">Thinking…</span>
          </div>
        ) : (
          <canvas ref={canvasRef} width={1600} height={64} className="h-10 min-w-0 flex-1" />
        )}

        {mode === "recording" && (
          <button
            type="button"
            onClick={handleStopRecording}
            aria-label="Stop and send"
            className="cursor-pointer rounded-full bg-linear-to-br from-white to-neutral-400 p-2.5 text-black transition-all hover:scale-105"
          >
            <SquareIcon className="size-4 fill-current" />
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

      {/* Cancel — absolutely positioned just outside the box so it never affects the bar's width */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel voice session"
        className="absolute left-full top-1/2 ml-2 -translate-y-1/2 cursor-pointer rounded-full p-2.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <XIcon className="size-5" />
      </button>
    </div>
  );
};

export default VoiceBar;
