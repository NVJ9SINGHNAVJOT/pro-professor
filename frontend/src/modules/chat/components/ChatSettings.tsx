import { useEffect, useRef, useState } from "react";
import { SettingsIcon } from "lucide-react";
import Tooltip from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";
import { MAX_TOKENS_LIMIT, type InferenceParams } from "@/modules/chat/types";

interface ChatSettingsProps {
  params: InferenceParams;
  onParamsChange: (params: InferenceParams) => void;
  verbose: boolean;
  onVerboseChange: (value: boolean) => void;
  thinkingEnabled: boolean;
  onThinkingChange: (value: boolean) => void;
  /** Whether the selected model can emit reasoning (gates the Thinking toggle). */
  supportsThinking: boolean;
  /** Model context window, used as the max-tokens ceiling. */
  maxContextTokens: number | null;
  /** Whether a model is currently selected — model-dependent rows are disabled until one is. */
  modelSelected: boolean;
  disabled?: boolean;
}

const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) => (
  <label className="block">
    <div className="mb-1 flex items-center justify-between">
      <span className="caption-small-regular text-neutral-300">{label}</span>
      <span className="caption-small-regular tabular-nums text-neutral-400">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ct-range h-1 w-full cursor-pointer accent-richblue-300"
    />
    <div className="mt-1 flex items-center justify-between caption-small-regular tabular-nums text-neutral-500">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  </label>
);

const ToggleRow = ({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    disabled={disabled}
    className={cn(
      "flex w-full items-center justify-between gap-3 text-left",
      disabled && "cursor-not-allowed opacity-50",
    )}
  >
    <span>
      <span className="block caption-small-regular text-neutral-200">{label}</span>
      <span className="block caption-small-regular text-neutral-500">{description}</span>
    </span>
    <span
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-richblue-300" : "bg-neutral-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </span>
  </button>
);

const ChatSettings = ({
  params,
  onParamsChange,
  verbose,
  onVerboseChange,
  thinkingEnabled,
  onThinkingChange,
  supportsThinking,
  maxContextTokens,
  modelSelected,
  disabled,
}: ChatSettingsProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close the panel on an outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const maxTokensCeiling = Math.min(maxContextTokens ?? MAX_TOKENS_LIMIT, MAX_TOKENS_LIMIT);
  const set = (patch: Partial<InferenceParams>) => onParamsChange({ ...params, ...patch });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="Inference settings"
        className={cn(
          "rounded-full p-2.5 transition-colors",
          disabled
            ? "cursor-not-allowed text-neutral-600"
            : "cursor-pointer text-neutral-300 hover:bg-neutral-700 hover:text-white",
        )}
      >
        <SettingsIcon className="size-4.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
          <div className="flex flex-col gap-3.5">
            {modelSelected ? (
              <div className="flex items-center justify-between">
                <span className="caption-small-regular text-neutral-300">Context window</span>
                <span className="caption-small-regular tabular-nums text-neutral-400">
                  {maxContextTokens != null ? `${maxContextTokens.toLocaleString()} tokens` : "—"}
                </span>
              </div>
            ) : (
              <Tooltip content="Select a model first" side="left">
                <div className="flex items-center justify-between">
                  <span className="caption-small-regular text-neutral-300">Context window</span>
                  <span className="caption-small-regular tabular-nums text-neutral-500">—</span>
                </div>
              </Tooltip>
            )}

            <div className="my-0.5 h-px bg-neutral-800" />

            <SliderRow
              label="Max tokens"
              value={Math.min(params.maxTokens, maxTokensCeiling)}
              min={1}
              max={maxTokensCeiling}
              step={1}
              onChange={(v) => set({ maxTokens: v })}
            />
            <SliderRow
              label="Temperature"
              value={params.temperature}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => set({ temperature: v })}
            />
            <SliderRow
              label="Top P"
              value={params.topP}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => set({ topP: v })}
            />
            <SliderRow
              label="Repetition penalty"
              value={params.repetitionPenalty}
              min={1}
              max={2}
              step={0.05}
              onChange={(v) => set({ repetitionPenalty: v })}
            />

            <div className="my-0.5 h-px bg-neutral-800" />

            <ToggleRow
              label="Verbose"
              description="Show token & timing stats"
              checked={verbose}
              onChange={onVerboseChange}
            />
            {modelSelected ? (
              supportsThinking && (
                <ToggleRow
                  label="Thinking"
                  description="Show the model's reasoning"
                  checked={thinkingEnabled}
                  onChange={onThinkingChange}
                />
              )
            ) : (
              <Tooltip content="Select a model first" side="left">
                <div>
                  <ToggleRow
                    label="Thinking"
                    description="Show the model's reasoning"
                    checked={false}
                    onChange={() => {}}
                    disabled
                  />
                </div>
              </Tooltip>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSettings;
