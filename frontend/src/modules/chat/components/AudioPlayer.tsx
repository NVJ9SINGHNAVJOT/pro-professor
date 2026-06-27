import { useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/** Themed audio player — replaces the browser's default <audio controls> chrome. */
const AudioPlayer = ({ src }: { src: string }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(e.target.value);
    audio.currentTime = next;
    setCurrent(next);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="flex h-[40.5px] items-center gap-2.5 rounded-2xl bg-neutral-700 px-2.5">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-linear-to-br from-white to-neutral-400 text-black transition-transform hover:scale-105"
      >
        {playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step="any"
        value={current}
        onChange={seek}
        aria-label="Seek"
        className="ct-audio-range h-1 w-28 cursor-pointer"
        style={{ background: `linear-gradient(to right, #fff ${progress}%, #525252 ${progress}%)` }}
      />
      <span className="shrink-0 caption-small-regular tabular-nums text-neutral-300">
        {formatTime(current)} / {formatTime(duration)}
      </span>
    </div>
  );
};

export default AudioPlayer;
