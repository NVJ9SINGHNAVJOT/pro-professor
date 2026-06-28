import { useEffect, useRef, useState } from "react";
import { SettingsIcon } from "lucide-react";
import Tooltip from "@/components/common/Tooltip";
import { SliderInput } from "@/components/inputs/SliderInput";
import { ToggleInput } from "@/components/inputs/ToggleInput";
import { cn } from "@/lib/utils";
import { MAX_TOKENS_LIMIT, type InferenceParams } from "@/modules/chat/types";

interface ChatSettingsProps {
  params: InferenceParams;
  onParamsChange: (params: InferenceParams) => void;
  /** Persona/instructions for a new conversation (the system prompt). */
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  /** Only a new chat can set a persona; it's baked into history once the conversation exists. */
  canEditSystemPrompt: boolean;
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

const ChatSettings = ({
  params,
  onParamsChange,
  systemPrompt,
  onSystemPromptChange,
  canEditSystemPrompt,
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
            {canEditSystemPrompt && (
              <>
                <label className="block">
                  <span className="mb-1 block caption-small-regular text-neutral-300">System prompt</span>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => onSystemPromptChange(e.target.value)}
                    rows={3}
                    placeholder="e.g. You are a professor of English literature."
                    className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 caption-small-regular text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-richblue-300"
                  />
                  <span className="mt-1 block caption-small-regular text-neutral-500">
                    Sets the model's persona for this chat. Locked once the chat starts.
                  </span>
                </label>
                <div className="my-0.5 h-px bg-neutral-800" />
              </>
            )}
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

            <SliderInput
              label="Max tokens"
              value={Math.min(params.maxTokens, maxTokensCeiling)}
              min={1}
              max={maxTokensCeiling}
              step={1}
              onChange={(v) => set({ maxTokens: v })}
            />
            <SliderInput
              label="Temperature"
              value={params.temperature}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => set({ temperature: v })}
            />
            <SliderInput
              label="Top P"
              value={params.topP}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => set({ topP: v })}
            />
            <SliderInput
              label="Repetition penalty"
              value={params.repetitionPenalty}
              min={1}
              max={2}
              step={0.05}
              onChange={(v) => set({ repetitionPenalty: v })}
            />

            <div className="my-0.5 h-px bg-neutral-800" />

            <ToggleInput
              label="Verbose"
              description="Show token & timing stats"
              checked={verbose}
              onChange={onVerboseChange}
            />
            {modelSelected ? (
              supportsThinking && (
                <ToggleInput
                  label="Thinking"
                  description="Show the model's reasoning"
                  checked={thinkingEnabled}
                  onChange={onThinkingChange}
                />
              )
            ) : (
              <Tooltip content="Select a model first" side="left">
                <div>
                  <ToggleInput
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
