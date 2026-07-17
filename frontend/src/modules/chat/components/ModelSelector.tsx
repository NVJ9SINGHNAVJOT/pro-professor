import { useMemo } from "react";
import Tooltip from "@/components/common/Tooltip";
import { ModelOptionLabel } from "@/components/common/ModelOptionLabel";
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
import { MODEL_SEPARATOR, PROVIDER_META, PROVIDER_ORDER } from "@/modules/chat/constants";

interface ModelSelectorProps {
  value: SelectedModel | null;
  onChange: (value: SelectedModel) => void;
  disabled?: boolean;
}

const encode = (provider: string, name: string) => `${provider}${MODEL_SEPARATOR}${name}`;

const ModelSelector = ({ value, onChange, disabled }: ModelSelectorProps) => {
  const { models, loaded } = useAppSelector((state) => state.models);

  const current = value ? encode(value.provider, value.model) : undefined;

  const handleChange = (encoded: string) => {
    const idx = encoded.indexOf(MODEL_SEPARATOR);
    const provider = encoded.slice(0, idx) as ModelProvider;
    const model = encoded.slice(idx + MODEL_SEPARATOR.length);
    const match = models.find((m) => m.provider === provider && m.name === model);
    const inputModalities = match?.inputModalities ?? ["text"];
    const maxContextTokens = match?.maxContextTokens ?? null;
    const supportsThinking = match?.supportsThinking ?? false;
    onChange({ provider, model, inputModalities, maxContextTokens, supportsThinking });
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
        <ModelOptionLabel
          name={m.name}
          modalities={m.inputModalities ?? ["text"]}
          providerLabel={provider?.label}
          providerClassName={provider?.className}
        />
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
        {providerMeta ? (
          <ModelOptionLabel
            name={value.model}
            nameClassName={isAvailable ? "text-neutral-300" : "text-neutral-400"}
            modalities={isAvailable ? modalities : []}
            providerLabel={providerMeta.label}
            providerClassName={isAvailable ? providerMeta.className : "bg-neutral-800 text-neutral-400"}
          />
        ) : (
          <span className={isAvailable ? "text-neutral-300" : "text-neutral-400"}>{value.model}</span>
        )}
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
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        className="border-neutral-700 bg-neutral-900 text-white [--accent-foreground:var(--color-white)] [--accent:var(--color-neutral-700)]"
      >
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
