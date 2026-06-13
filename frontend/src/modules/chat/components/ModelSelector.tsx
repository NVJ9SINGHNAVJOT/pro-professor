import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/hooks/useApi";
import { modelsRoute, type ModelProvider, type ProviderModel } from "@/services/operations/models.route";
import type { SelectedModel } from "@/modules/chat/types";

interface ModelSelectorProps {
  value: SelectedModel | null;
  onChange: (value: SelectedModel) => void;
  disabled?: boolean;
}

const SEPARATOR = "::";
const encode = (provider: string, name: string) => `${provider}${SEPARATOR}${name}`;

/** Maps a modality string to an icon + accessible label. */
const MODALITY_META: Record<string, { icon: string; label: string }> = {
  text:  { icon: "📝", label: "Text" },
  image: { icon: "🖼️", label: "Image" },
  audio: { icon: "🎤", label: "Audio" },
  video: { icon: "🎬", label: "Video" },
};

const ModelSelector = ({ value, onChange, disabled }: ModelSelectorProps) => {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const { execute: fetchModels } = useApi(modelsRoute.getAllModels);

  useEffect(() => {
    (async () => {
      const res = await fetchModels();
      if (!res.error) {
        setModels(res.response.data.models);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = value ? encode(value.provider, value.model) : undefined;

  const handleChange = (encoded: string) => {
    const idx = encoded.indexOf(SEPARATOR);
    const provider = encoded.slice(0, idx) as ModelProvider;
    const model = encoded.slice(idx + SEPARATOR.length);
    const match = models.find((m) => m.provider === provider && m.name === model);
    const inputModalities = match?.inputModalities ?? ["text"];
    onChange({ provider, model, inputModalities });
  };

  return (
    <Select value={current} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className="gap-1.5 border-transparent bg-transparent text-neutral-200 shadow-none transition-colors para-small-medium hover:border-neutral-700 hover:bg-neutral-800 data-placeholder:text-neutral-400 [&_svg:not([class*='text-'])]:text-neutral-400"
      >
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent side="top" align="end" className="bg-neutral-900 text-white border-neutral-700">
        {models.map((m) => (
          <SelectItem key={encode(m.provider, m.name)} value={encode(m.provider, m.name)}>
            <span className="flex items-center gap-2">
              <span>{m.name}</span>
              <span className="flex items-center gap-0.5 text-xs opacity-70" aria-label="Supported input types">
                {(m.inputModalities ?? ["text"]).map((mod) => {
                  const meta = MODALITY_META[mod];
                  return meta ? (
                    <span key={mod} title={meta.label} role="img" aria-label={meta.label}>
                      {meta.icon}
                    </span>
                  ) : null;
                })}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;

