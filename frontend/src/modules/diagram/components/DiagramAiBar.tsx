import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, SparklesIcon, SquareIcon } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { toast } from "@/components/common/toast";
import ModelSelector from "@/components/common/ModelSelector";
import { useDefaultSelectedModel } from "@/hooks/useDefaultSelectedModel";
import { runAiEdit } from "@/modules/diagram/ai/runAiEdit";
import type { SelectedModel } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

interface DiagramAiBarProps {
  diagramId: number;
  /** Live editor API accessor — the edit reads the scene from it and applies to it. */
  getApi: () => ExcalidrawImperativeAPI | null;
  /** A valid edit was applied to the scene — persist it (with a revision snapshot). */
  onApplied: () => void;
}

/** AI edits over the open diagram: instruction in, Mermaid generation or command list applied. */
const DiagramAiBar = ({ diagramId, getApi, onApplied }: DiagramAiBarProps) => {
  const [instruction, setInstruction] = useState("");
  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
    <div className="flex shrink-0 items-center gap-x-2 border-b border-neutral-800 bg-neutral-900/40 px-4 py-2">
      <SparklesIcon className={cn("size-4 shrink-0", busy ? "animate-pulse text-sky-400" : "text-neutral-400")} />
      <input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") run();
        }}
        disabled={busy}
        placeholder="Ask the AI to change the diagram's structure…"
        className="min-w-0 flex-1 bg-transparent caption-small-regular text-neutral-200 outline-none placeholder:text-neutral-500"
      />
      {busy ? (
        <button
          type="button"
          onClick={handleStop}
          aria-label="Stop generation"
          className="cursor-pointer rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <SquareIcon className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          aria-label="Run AI edit"
          className="cursor-pointer rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <ArrowRightIcon className="size-4" />
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
