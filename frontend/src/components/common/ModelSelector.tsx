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
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/redux/store";
import { type ModelProvider, type ProviderModel } from "@/services/operations/models/models.route";
import type { SelectedModel } from "@/modules/chat/types";
import { MODEL_SEPARATOR, PROVIDER_META, PROVIDER_ORDER } from "@/modules/chat/constants";

/**
 * The one model picker, shared by chat, notes and diagrams. Reads the model
 * list from the store, groups by provider, and reports a full {@link SelectedModel}.
 */
interface ModelSelectorProps {
  value: SelectedModel | null;
  onChange: (value: SelectedModel) => void;
  disabled?: boolean;
  /** Dropdown alignment relative to the trigger — "end" for right-edge placements. */
  align?: "start" | "end";
  /** Optional filter to exclude certain models (like embeddings) from the list. */
  filter?: (model: ProviderModel) => boolean;
  /**
   * Fills its container instead of sizing to the model name, and clips the name with an ellipsis
   * rather than overflowing — for narrow places (the notes AI tab). The full name is in a tooltip.
   */
  fullWidth?: boolean;
}

const encode = (provider: string, name: string) => `${provider}${MODEL_SEPARATOR}${name}`;

const ModelSelector = ({ value, onChange, disabled, align = "start", filter, fullWidth }: ModelSelectorProps) => {
  const { models, loaded } = useAppSelector((state) => state.models);

  const current = value ? encode(value.provider, value.model) : undefined;
  /** The whole name, for the tooltip that backs up a clipped one. */
  const fullLabel = value ? `${PROVIDER_META[value.provider]?.label ?? value.provider} · ${value.model}` : "";

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
      if (filter && !filter(m)) continue;
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
  }, [models, filter]);

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

  // Viewing history / locked while generating: show static disabled display
  if (disabled && value) {
    const providerMeta = PROVIDER_META[value.provider];
    const matchedModel = loaded ? models.find((m) => m.provider === value.provider && m.name === value.model) : null;
    const isAvailable = Boolean(matchedModel);
    const modalities = matchedModel?.inputModalities ?? [];

    if (fullWidth) {
      return (
        <Tooltip content={isAvailable ? fullLabel : "Model not available"} side="top">
          <div className="flex w-full cursor-not-allowed items-center rounded-lg px-2 py-1 para-small-medium select-none">
            <ModelOptionLabel
              className="min-w-0"
              name={value.model}
              nameClassName={cn("min-w-0 truncate", isAvailable ? "text-neutral-300" : "text-neutral-400")}
              modalities={isAvailable ? modalities : []}
              providerLabel={providerMeta?.label}
              providerClassName={isAvailable ? providerMeta?.className : "bg-neutral-800 text-neutral-400"}
            />
          </div>
        </Tooltip>
      );
    }

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

  // No models loaded yet or none available
  if (!disabled && loaded && models.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center rounded-md px-2 py-1 para-small-medium text-neutral-500 cursor-not-allowed select-none",
          fullWidth && "w-full",
        )}
      >
        No models available
      </div>
    );
  }

  const providerMeta = value ? PROVIDER_META[value.provider] : undefined;
  // Read off the loaded list, like the disabled branch does: what's baked into `value` can be stale
  // when the selection was restored before the models arrived.
  const triggerModalities = value
    ? (models.find((m) => m.provider === value.provider && m.name === value.model)?.inputModalities ??
      value.inputModalities ?? ["text"])
    : [];
  const trigger = (
    <SelectTrigger
      size="sm"
      aria-label={fullWidth ? fullLabel || "Select a model" : undefined}
      className={cn(
        "gap-1.5 border-transparent bg-transparent text-neutral-200 shadow-none transition-colors para-small-medium hover:border-neutral-700 hover:bg-neutral-800 data-placeholder:text-neutral-400 [&_svg:not([class*='text-'])]:text-neutral-400",
        fullWidth && "w-full",
      )}
    >
      {fullWidth ? (
        // The same row chat's trigger shows, built here rather than through SelectValue: only this
        // copy can hand the name the leftover width (`min-w-0 truncate`) while the badges hold
        // their size, which is what keeps it inside a narrow pane. Full name in the tooltip.
        value ? (
          <ModelOptionLabel
            className="min-w-0"
            name={value.model}
            nameClassName="min-w-0 truncate"
            modalities={triggerModalities}
            providerLabel={providerMeta?.label}
            providerClassName={providerMeta?.className}
          />
        ) : (
          <span className="truncate text-neutral-400">Select a model</span>
        )
      ) : (
        <SelectValue placeholder="Select a model" />
      )}
    </SelectTrigger>
  );

  return (
    <Select value={current} onValueChange={handleChange} disabled={disabled}>
      {fullWidth && value ? (
        <Tooltip content={fullLabel} side="top">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <SelectContent
        position="popper"
        side="bottom"
        align={align}
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
