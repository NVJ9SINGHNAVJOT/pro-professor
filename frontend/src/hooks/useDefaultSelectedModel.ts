import { useMemo } from "react";
import { useAppSelector } from "@/redux/store";
import type { SelectedModel } from "@/modules/chat/types";

/**
 * Default pick for the AI bars (notes/diagrams): the active model, else the
 * first available one — used until the user chooses in the ModelSelector.
 */
export function useDefaultSelectedModel(): SelectedModel | null {
  const models = useAppSelector((state) => state.models.models);
  return useMemo(() => {
    const fallback = models.find((model) => model.isActive) ?? models[0];
    if (!fallback) return null;
    return {
      provider: fallback.provider,
      model: fallback.name,
      inputModalities: fallback.inputModalities ?? ["text"],
      maxContextTokens: fallback.maxContextTokens ?? null,
      supportsThinking: fallback.supportsThinking ?? false,
    };
  }, [models]);
}
