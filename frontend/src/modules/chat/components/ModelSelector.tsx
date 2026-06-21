import React, { useMemo } from "react";
import Tooltip from "@/components/common/Tooltip";
import { FileText, ImageIcon, Mic, Video } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/redux/store";
import { type ModelProvider, type ProviderModel } from "@/services/operations/models/models.route";
import type { SelectedModel } from "@/modules/chat/types";

interface ModelSelectorProps {
  value: SelectedModel | null;
  onChange: (value: SelectedModel) => void;
  disabled?: boolean;
}

const SEPARATOR = "::";
const encode = (provider: string, name: string) => `${provider}${SEPARATOR}${name}`;

const MODALITY_META: Record<
  string,
  { icon: React.ComponentType<{ size?: number }>; label: string; className: string }
> = {
  text: { icon: FileText, label: "Text", className: "bg-neutral-700 text-neutral-300" },
  image: { icon: ImageIcon, label: "Image", className: "bg-violet-900/60 text-violet-300" },
  audio: { icon: Mic, label: "Audio", className: "bg-blue-900/60 text-blue-300" },
  video: { icon: Video, label: "Video", className: "bg-amber-900/60 text-amber-300" },
};

const PROVIDER_META: Record<ModelProvider, { label: string; className: string }> = {
  "ai-service": { label: "AI Service", className: "bg-emerald-900/60 text-emerald-300" },
  ollama: { label: "Ollama", className: "bg-sky-900/60 text-sky-300" },
};

const PROVIDER_ORDER: ModelProvider[] = ["ai-service", "ollama"];

const ModelSelector = ({ value, onChange, disabled }: ModelSelectorProps) => {
  const { models, loaded } = useAppSelector((state) => state.models);

  const current = value ? encode(value.provider, value.model) : undefined;

  const handleChange = (encoded: string) => {
    const idx = encoded.indexOf(SEPARATOR);
    const provider = encoded.slice(0, idx) as ModelProvider;
    const model = encoded.slice(idx + SEPARATOR.length);
    const match = models.find((m) => m.provider === provider && m.name === model);
    const inputModalities = match?.inputModalities ?? ["text"];
    onChange({ provider, model, inputModalities });
  };

  const groups = useMemo(() => {
    const byProvider = new Map<ModelProvider, ProviderModel[]>();
    for (const m of models) {
      const list = byProvider.get(m.provider) ?? [];
      list.push(m);
      byProvider.set(m.provider, list);
    }
    const ordered = [...byProvider.keys()].sort((a, b) => {
      const ai = PROVIDER_ORDER.indexOf(a);
      const bi = PROVIDER_ORDER.indexOf(b);
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
    });
    return ordered.map((provider) => ({ provider, items: byProvider.get(provider)! }));
  }, [models]);

  const renderItem = (m: ProviderModel) => {
    const provider = PROVIDER_META[m.provider];
    return (
      <SelectItem key={encode(m.provider, m.name)} value={encode(m.provider, m.name)}>
        <span className="flex items-center gap-2">
          {provider && (
            <span
              className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${provider.className}`}
            >
              {provider.label}
            </span>
          )}
          <span>{m.name}</span>
          <span className="flex items-center gap-1" aria-label="Supported input types">
            {(m.inputModalities ?? ["text"]).map((mod) => {
              const meta = MODALITY_META[mod];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <span
                  key={mod}
                  title={meta.label}
                  className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${meta.className}`}
                >
                  <Icon size={10} />
                  {meta.label}
                </span>
              );
            })}
          </span>
        </span>
      </SelectItem>
    );
  };

  // Viewing history: show static disabled display
  if (disabled && value) {
    const providerMeta = PROVIDER_META[value.provider];
    const matchedModel = loaded ? models.find((m) => m.provider === value.provider && m.name === value.model) : null;
    const isAvailable = Boolean(matchedModel);
    const modalities = matchedModel?.inputModalities ?? [];

    const display = (
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1 para-small-medium cursor-not-allowed select-none text-neutral-400">
        {providerMeta && (
          <span
            className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${
              isAvailable ? providerMeta.className : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {providerMeta.label}
          </span>
        )}
        <span className={isAvailable ? "text-neutral-300" : "text-neutral-400"}>{value.model}</span>
        {isAvailable &&
          modalities.map((mod) => {
            const meta = MODALITY_META[mod];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <span
                key={mod}
                title={meta.label}
                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${meta.className}`}
              >
                <Icon size={10} />
                {meta.label}
              </span>
            );
          })}
      </div>
    );

    if (!isAvailable) {
      return (
        <Tooltip content="Model not available" side="top">
          {display}
        </Tooltip>
      );
    }
    return display;
  }

  // New chat: no models loaded yet or none available
  if (!disabled && loaded && models.length === 0) {
    return (
      <div className="flex items-center rounded-md px-2 py-1 para-small-medium text-neutral-500 cursor-not-allowed select-none">
        No models available
      </div>
    );
  }

  return (
    <Select value={current} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className="gap-1.5 border-transparent bg-transparent text-neutral-200 shadow-none transition-colors para-small-medium hover:border-neutral-700 hover:bg-neutral-800 data-placeholder:text-neutral-400 [&_svg:not([class*='text-'])]:text-neutral-400"
      >
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent position="popper" side="top" align="end" className="bg-neutral-900 text-white border-neutral-700">
        {groups.map(({ provider, items }) => (
          <SelectGroup key={provider}>
            <SelectLabel className="text-neutral-400">{PROVIDER_META[provider]?.label ?? provider}</SelectLabel>
            {items.map(renderItem)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
