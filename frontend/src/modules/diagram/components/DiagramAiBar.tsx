import { useEffect, useRef, useState } from "react";
import { SparklesIcon, SquareIcon, WandSparklesIcon } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { toast } from "@/components/common/toast";
import ModelSelector from "@/components/common/ModelSelector";
import { useDefaultSelectedModel } from "@/hooks/useDefaultSelectedModel";
import { runAiEdit } from "@/modules/diagram/ai/runAiEdit";
import type { SelectedModel } from "@/modules/chat/types";

interface DiagramAiBarProps {
  diagramId: number;
  /** Live editor API accessor — the edit reads the scene from it and applies to it. */
  getApi: () => ExcalidrawImperativeAPI | null;
  /** A valid edit was applied to the scene — persist it (with a revision snapshot). */
  onApplied: () => void;
}

/** AI edits over the open diagram: Mermaid generation or a command-list applied. Mirrors the notes AI bar. */
const DiagramAiBar = ({ diagramId, getApi, onApplied }: DiagramAiBarProps) => {
  const [instruction, setInstruction] = useState("");
  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // stop generation when the diagram changes or the bar unmounts
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [diagramId]);

  // fall back to the active model (or the first available one) until the user picks one
  const defaultModel = useDefaultSelectedModel();
  const activeSelection = selected ?? defaultModel;

  const run = async () => {
    if (busy) return;
    if (!instruction.trim()) {
      toast.error("Describe what the AI should change");
      inputRef.current?.focus();
      return;
    }
    if (!activeSelection) {
      toast.error("No model available — activate a model first");
      return;
    }
    const api = getApi();
    if (!api) {
      toast.error("The canvas is not ready yet");
      return;
    }

    setBusy(true);
    const result = await runAiEdit({
      diagramId,
      instruction: instruction.trim(),
      provider: activeSelection.provider,
      model: activeSelection.model,
      api,
      onController: (controller) => {
        abortRef.current = controller;
      },
    });
    setBusy(false);
    if (!result.ok) {
      if (!result.cancelled) toast.error(result.error); // a user stop is not an error
      return;
    }
    setInstruction("");
    if (result.repaired) toast.info("The model needed one retry to produce a valid edit");
    onApplied();
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  return (
    <div className="flex h-11.5 shrink-0 items-center gap-x-2 border-b border-neutral-800 bg-neutral-900/40 px-4">
      <SparklesIcon className="size-4 shrink-0 text-neutral-400" />
      <input
        ref={inputRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") run();
        }}
        disabled={busy}
        placeholder="Ask AI to change the diagram… (e.g. draw a login flow, or add a Redis node)"
        className="min-w-0 flex-1 bg-transparent para-small-medium text-neutral-200 outline-none placeholder:text-neutral-500 disabled:opacity-50"
      />
      {/* Fixed footprint so the Run→Stop swap never shifts the model picker. */}
      {busy ? (
        <button
          type="button"
          onClick={handleStop}
          aria-label="Stop generating"
          className="flex h-7 w-19 shrink-0 cursor-pointer items-center justify-center gap-x-1.5 rounded-lg bg-white caption-small-medium text-black hover:bg-neutral-200"
        >
          <SquareIcon className="size-3 fill-current" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          title="Apply the instruction to the diagram"
          className="flex h-7 w-19 shrink-0 cursor-pointer items-center justify-center gap-x-1.5 rounded-lg caption-small-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <WandSparklesIcon className="size-3.5" />
          Run
        </button>
      )}
      {/* model picker sits at the bar's right edge, shared with chat and notes */}
      <div className="shrink-0">
        <ModelSelector value={activeSelection} onChange={setSelected} disabled={busy} align="end" />
      </div>
    </div>
  );
};

export default DiagramAiBar;
