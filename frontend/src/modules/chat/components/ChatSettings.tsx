import { memo, useCallback, useState } from "react";
import {
  SettingsIcon,
  Scale as ScaleIcon,
  Palette as PaletteIcon,
  Target as TargetIcon,
  Brain as BrainIcon,
  Microscope as MicroscopeIcon,
} from "lucide-react";

import type { ElementType } from "react";

const PRESET_ICONS: Record<string, ElementType> = {
  Scale: ScaleIcon,
  Palette: PaletteIcon,
  Target: TargetIcon,
  Brain: BrainIcon,
  Microscope: MicroscopeIcon,
};
import Modal from "@/components/common/Modal";
import Tooltip from "@/components/common/Tooltip";
import { SliderInput } from "@/components/inputs/SliderInput";
import { ToggleInput } from "@/components/inputs/ToggleInput";
import VoiceSettingsControls from "@/components/common/VoiceSettingsControls";
import { cn } from "@/lib/utils";
import {
  MAX_TOKENS_SLIDER,
  TEMPERATURE_SLIDER,
  TOP_P_SLIDER,
  REPETITION_PENALTY_SLIDER,
  INFERENCE_PRESETS,
} from "@/modules/chat/constants";
import type { InferenceParams, VoiceSettings } from "@/modules/chat/types";

interface ChatSettingsProps {
  params: InferenceParams;
  onParamsChange: (params: InferenceParams) => void;
  /** This chat's voice settings — seeded from the Settings defaults, saved with the next turn. */
  voice: VoiceSettings;
  onVoiceChange: (voice: VoiceSettings) => void;
  /** Whether the selected model can take audio input (gates the "listen directly" path). */
  acceptsAudio: boolean;
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

/**
 * The chat's per-conversation settings, opened from the gear in the top bar. A modal rather than a
 * dropdown: with the voice controls added it carries four groups of settings, which is more than a
 * popover anchored to a header button can hold without running off the screen.
 */
const ChatSettings = memo(function ChatSettings({
  params,
  onParamsChange,
  voice,
  onVoiceChange,
  acceptsAudio,
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
}: ChatSettingsProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const maxTokensCeiling = Math.min(maxContextTokens ?? MAX_TOKENS_SLIDER.max, MAX_TOKENS_SLIDER.max);
  const set = (patch: Partial<InferenceParams>) => onParamsChange({ ...params, ...patch });

  // What the next spoken turn will actually do — the STT model only runs when the chat model
  // isn't hearing the clip itself.
  const listensDirectly = acceptsAudio && voice.preferModelAudio;
  const sttNote = !modelSelected
    ? "Used for dictation. Select a model to see how voice chat will run."
    : listensDirectly
      ? "Voice chat sends the recording to the model, which transcribes it itself. This model runs for dictation only."
      : "Used for dictation and for voice chat.";

  const activePresetId = INFERENCE_PRESETS.find(
    (p) =>
      p.params.temperature === params.temperature &&
      p.params.topP === params.topP &&
      p.params.repetitionPenalty === params.repetitionPenalty,
  )?.id;

  return (
    <>
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

      <Modal open={open} onClose={close} title="Chat settings" description="Applies to this conversation.">
        <div className="p-6">
          <div className="grid grid-cols-3 gap-10">
            {/* Column 1: Response Styles */}
            <div className="flex flex-col gap-6">
              <div>
                <span className="mb-3 block caption-small-regular text-neutral-300">Response Style</span>
                <div className="flex flex-col gap-2">
                  {INFERENCE_PRESETS.map((preset) => {
                    const Icon = PRESET_ICONS[preset.icon];
                    const isActive = activePresetId === preset.id;
                    return (
                      <Tooltip key={preset.id} content={preset.tooltip} side="left">
                        <button
                          type="button"
                          onClick={() => set(preset.params)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                            isActive
                              ? "border-richblue-300 bg-richblue-300/10"
                              : "border-neutral-700 bg-neutral-800 hover:bg-neutral-700",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              isActive ? "bg-richblue-300 text-neutral-900" : "bg-neutral-700 text-neutral-300",
                            )}
                          >
                            <Icon className="size-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn("truncate para-small-medium", isActive ? "text-white" : "text-neutral-200")}
                            >
                              {preset.label}
                            </div>
                            <div
                              className={cn(
                                "truncate caption-small-regular",
                                isActive ? "text-richblue-300/90" : "text-neutral-400",
                              )}
                            >
                              {preset.description}
                            </div>
                            <div
                              className={cn(
                                "truncate text-[10px] mt-0.5",
                                isActive ? "text-richblue-300/70" : "text-neutral-500",
                              )}
                            >
                              T: {preset.params.temperature} • P: {preset.params.topP} • R:{" "}
                              {preset.params.repetitionPenalty}
                            </div>
                          </div>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Column 2: Custom Settings */}
            <div className="flex flex-col gap-6">
              <div>
                <span className="mb-3 block caption-small-regular text-neutral-300">Custom Settings</span>
                <div className="flex flex-col gap-6">
                  <SliderInput
                    label="Max tokens"
                    value={Math.min(params.maxTokens, maxTokensCeiling)}
                    min={MAX_TOKENS_SLIDER.min}
                    max={maxTokensCeiling}
                    step={MAX_TOKENS_SLIDER.step}
                    labels={["500", "8K", "16K", "24K", "32K"]}
                    onChange={(v) => set({ maxTokens: v })}
                  />
                  <SliderInput
                    label="Temperature"
                    value={params.temperature}
                    min={TEMPERATURE_SLIDER.min}
                    max={TEMPERATURE_SLIDER.max}
                    step={TEMPERATURE_SLIDER.step}
                    labels={["0", "0.5", "1", "1.5", "2"]}
                    onChange={(v) => set({ temperature: v })}
                  />
                  <SliderInput
                    label="Top P"
                    value={params.topP}
                    min={TOP_P_SLIDER.min}
                    max={TOP_P_SLIDER.max}
                    step={TOP_P_SLIDER.step}
                    labels={["0", "0.5", "1"]}
                    onChange={(v) => set({ topP: v })}
                  />
                  <SliderInput
                    label="Repetition penalty"
                    value={params.repetitionPenalty}
                    min={REPETITION_PENALTY_SLIDER.min}
                    max={REPETITION_PENALTY_SLIDER.max}
                    step={REPETITION_PENALTY_SLIDER.step}
                    labels={["1", "1.5", "2"]}
                    onChange={(v) => set({ repetitionPenalty: v })}
                  />
                </div>
              </div>
            </div>

            {/* Column 3: System Prompt & Toggles */}
            <div className="flex flex-col gap-6">
              {canEditSystemPrompt && (
                <div>
                  <label className="block">
                    <span className="mb-2 block caption-small-regular text-neutral-300">System prompt</span>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => onSystemPromptChange(e.target.value)}
                      onBlur={(e) => {
                        const trimmed = e.target.value.trim();
                        if (trimmed !== e.target.value) {
                          onSystemPromptChange(trimmed);
                        }
                      }}
                      rows={14}
                      placeholder="e.g. You are a professor of English literature."
                      className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 para-small-medium text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-richblue-300"
                    />
                    <span className="mt-1.5 block caption-small-regular text-neutral-500">
                      Sets the model's persona for this chat. Locked once the chat starts.
                    </span>
                  </label>
                </div>
              )}

              <div>
                {modelSelected ? (
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <span className="caption-small-regular text-neutral-300">Context window</span>
                    <span className="caption-small-regular tabular-nums text-neutral-400">
                      {maxContextTokens != null ? `${maxContextTokens.toLocaleString()} tokens` : "—"}
                    </span>
                  </div>
                ) : (
                  <div className="border-b border-neutral-800 pb-3">
                    <Tooltip content="Select a model first" side="left">
                      <div className="flex items-center justify-between">
                        <span className="caption-small-regular text-neutral-300">Context window</span>
                        <span className="caption-small-regular tabular-nums text-neutral-500">—</span>
                      </div>
                    </Tooltip>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
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
          </div>

          {/* Voice — full width under the grid: five controls don't fit a fourth column */}
          <div className="mt-6 border-t border-neutral-800 pt-6">
            <div className="mb-4">
              <span className="block caption-small-regular text-neutral-300">Voice</span>
              <span className="block caption-small-regular text-neutral-500">
                This chat only — Settings → Chat sets what a new chat starts with.
              </span>
            </div>
            <VoiceSettingsControls value={voice} onChange={onVoiceChange} sttNote={sttNote} />
          </div>
        </div>
      </Modal>
    </>
  );
});

export default ChatSettings;
