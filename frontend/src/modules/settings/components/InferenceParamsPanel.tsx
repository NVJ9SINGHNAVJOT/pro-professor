import type { ElementType } from "react";
import {
  Scale as ScaleIcon,
  Palette as PaletteIcon,
  Target as TargetIcon,
  Brain as BrainIcon,
  Microscope as MicroscopeIcon,
  RotateCcwIcon,
} from "lucide-react";
import Tooltip from "@/components/common/Tooltip";
import { SliderInput } from "@/components/inputs/SliderInput";
import {
  MAX_TOKENS_SLIDER,
  TEMPERATURE_SLIDER,
  TOP_P_SLIDER,
  REPETITION_PENALTY_SLIDER,
  INFERENCE_PRESETS,
} from "@/modules/chat/constants";
import type { InferenceParams } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

const PRESET_ICONS: Record<string, ElementType> = {
  Scale: ScaleIcon,
  Palette: PaletteIcon,
  Target: TargetIcon,
  Brain: BrainIcon,
  Microscope: MicroscopeIcon,
};

interface InferenceParamsPanelProps {
  title: string;
  description: string;
  params: InferenceParams;
  onChange: (params: InferenceParams) => void;
  onReset: () => void;
}

/**
 * A default-inference-params editor for a feature (e.g., Notes): the same preset cards +
 * sliders the chat panel uses, plus a Reset. Fully controlled — the screen owns the state.
 */
const InferenceParamsPanel = ({ title, description, params, onChange, onReset }: InferenceParamsPanelProps) => {
  const set = (patch: Partial<InferenceParams>) => onChange({ ...params, ...patch });

  const activePresetId = INFERENCE_PRESETS.find(
    (p) =>
      p.params.temperature === params.temperature &&
      p.params.topP === params.topP &&
      p.params.repetitionPenalty === params.repetitionPenalty,
  )?.id;

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="para-medium-semibold text-white">{title}</h2>
          <p className="mt-1 caption-small-regular text-neutral-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 cursor-pointer items-center gap-x-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 caption-small-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <RotateCcwIcon className="size-3.5" />
          Reset to defaults
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Presets */}
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
                      <div className={cn("truncate para-small-medium", isActive ? "text-white" : "text-neutral-200")}>
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

        {/* Sliders */}
        <div>
          <span className="mb-3 block caption-small-regular text-neutral-300">Custom Settings</span>
          <div className="flex flex-col gap-6">
            <SliderInput
              label="Max tokens"
              value={params.maxTokens}
              min={MAX_TOKENS_SLIDER.min}
              max={MAX_TOKENS_SLIDER.max}
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
    </section>
  );
};

export default InferenceParamsPanel;
