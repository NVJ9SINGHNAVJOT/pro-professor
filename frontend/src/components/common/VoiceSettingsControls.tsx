import { memo, useCallback } from "react";
import { SelectInput } from "@/components/inputs/SelectInput";
import { SliderInput } from "@/components/inputs/SliderInput";
import { ToggleInput } from "@/components/inputs/ToggleInput";
import { useAppSelector } from "@/redux/store";
import type { VoiceSettings } from "@/modules/chat/types";

/** Kokoro voice ids are `<lang><gender>_<name>`, e.g. `af_heart` = American English, female. */
const GENDERS: Record<string, string> = { f: "female", m: "male" };

interface VoiceSettingsControlsProps {
  value: VoiceSettings;
  onChange: (value: VoiceSettings) => void;
  /** Rendered under the STT row — the chat panel uses it to say which path the next turn takes. */
  sttNote?: string;
  disabled?: boolean;
}

/**
 * The five voice controls, shared by Settings → Chat (where they edit the app-wide defaults) and
 * the chat settings panel (where they override them for one conversation). The option lists come
 * from the AI core via `audioSlice`, so this reads Redux rather than taking them as props.
 */
const VoiceSettingsControls = memo(function VoiceSettingsControls({
  value,
  onChange,
  sttNote,
  disabled,
}: VoiceSettingsControlsProps) {
  const capabilities = useAppSelector((state) => state.audio.capabilities);

  const set = useCallback(
    (patch: Partial<VoiceSettings>) => onChange({ ...value, ...patch }),
    [onChange, value],
  );

  if (!capabilities) {
    return (
      <p className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 caption-small-regular text-neutral-400">
        Voice models are unavailable — the AI core isn't reachable. Start it and reopen this page to
        choose a speech model or voice.
      </p>
    );
  }

  const { stt, tts } = capabilities;
  const langLabels = new Map(tts.langCodes.map((lang) => [lang.code, lang.label]));

  // A stored model that has since dropped out of the AI core's allowlist would otherwise leave the
  // select blank — show it, marked, so it's obvious why speech is falling back.
  const sttOptions = stt.models.map((model) => ({
    value: model.id,
    label: `${model.id.split("/").pop()}${model.ready ? "" : " — not downloaded"}`,
  }));
  if (value.sttModel && !stt.models.some((model) => model.id === value.sttModel)) {
    sttOptions.unshift({ value: value.sttModel, label: `${value.sttModel} — unavailable` });
  }

  const voiceOptions = tts.voices.map((voiceId) => {
    const [prefix] = voiceId.split("_");
    const language = langLabels.get(prefix[0]);
    const gender = GENDERS[prefix[1]];
    return {
      value: voiceId,
      label: language && gender ? `${voiceId} · ${language}, ${gender}` : voiceId,
    };
  });
  if (value.ttsVoice && !tts.voices.includes(value.ttsVoice)) {
    voiceOptions.unshift({ value: value.ttsVoice, label: `${value.ttsVoice} — unavailable` });
  }

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
      <div>
        <span className="mb-1.5 block caption-small-regular text-neutral-300">Speech-to-text model</span>
        <SelectInput
          options={sttOptions}
          value={value.sttModel}
          onChange={(sttModel) => set({ sttModel })}
          readOnly={disabled}
        />
        <span className="mt-1.5 block caption-small-regular text-neutral-500">
          {sttNote ?? "Used for dictation and for voice chat."}
        </span>
      </div>

      <div>
        <span className="mb-1.5 block caption-small-regular text-neutral-300">Voice</span>
        <SelectInput
          options={voiceOptions}
          value={value.ttsVoice}
          onChange={(ttsVoice) => {
            // Kokoro expects the language to match the voice's prefix letter, so follow it.
            const prefix = ttsVoice[0];
            set({ ttsVoice, ...(langLabels.has(prefix) ? { ttsLangCode: prefix } : {}) });
          }}
          readOnly={disabled}
        />
        <span className="mt-1.5 block caption-small-regular text-neutral-500">
          How spoken replies sound.
        </span>
      </div>

      <div>
        <span className="mb-1.5 block caption-small-regular text-neutral-300">Language</span>
        <SelectInput
          options={tts.langCodes.map((lang) => ({ value: lang.code, label: lang.label }))}
          value={value.ttsLangCode}
          onChange={(ttsLangCode) => set({ ttsLangCode })}
          readOnly={disabled}
        />
        <span className="mt-1.5 block caption-small-regular text-neutral-500">
          Pronunciation used when speaking. Follows the voice you pick.
        </span>
      </div>

      <SliderInput
        label="Speaking speed"
        value={value.ttsSpeed}
        min={tts.speed.min}
        max={tts.speed.max}
        step={0.05}
        labels={[`${tts.speed.min}x`, `${tts.speed.defaultSpeed}x`, `${tts.speed.max}x`]}
        onChange={(ttsSpeed) => set({ ttsSpeed })}
      />

      <div className="col-span-2 border-t border-neutral-800 pt-4">
        <ToggleInput
          label="Let audio-capable models listen directly"
          description="When the selected model accepts audio, send it the recording instead of transcribing first."
          checked={value.preferModelAudio}
          onChange={(preferModelAudio) => set({ preferModelAudio })}
          disabled={disabled}
        />
      </div>
    </div>
  );
});

export default VoiceSettingsControls;
