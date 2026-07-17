import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, ListPlusIcon, SparklesIcon, SquareIcon, WandSparklesIcon } from "lucide-react";
import { toast } from "@/components/common/toast";
import { ModelOptionLabel } from "@/components/common/ModelOptionLabel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSelector } from "@/redux/store";
import { notesStream, type NoteAiAction } from "@/services/operations/notes/notes.stream";
import { PROVIDER_META } from "@/modules/chat/constants";
import { cn } from "@/lib/utils";

/** What the command palette can ask the bar to do. */
export type AiBarCommand = NoteAiAction | "focus";

interface AiBarProps {
  noteId: number;
  /** A palette-issued command to execute; acknowledged via {@link onCommandHandled}. */
  pendingCommand: AiBarCommand | null;
  onCommandHandled: () => void;
  /** Live editor updates while the model streams the rewritten note. */
  onContent: (content: string) => void;
  /** The backend saved the note (a revision of the prior content exists) — refetch it. */
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** AI actions over the active note: rewrite by instruction, summarize, continue writing. */
const AiBar = ({ noteId, pendingCommand, onCommandHandled, onContent, onSaved, onBusyChange }: AiBarProps) => {
  const models = useAppSelector((state) => state.models.models);
  const [instruction, setInstruction] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // stop generation when the note changes or the bar unmounts
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [noteId]);

  const providerOptions = useMemo(
    () =>
      models.map((model) => ({
        value: JSON.stringify([model.provider, model.name]),
        name: model.name,
        modalities: model.inputModalities ?? ["text"],
        providerLabel: PROVIDER_META[model.provider]?.label,
        providerClassName: PROVIDER_META[model.provider]?.className,
      })),
    [models],
  );

  // fall back to the active model (or the first available one) until the user picks one
  const defaultValue = useMemo(() => {
    const active = models.find((m) => m.isActive) ?? models[0];
    return active ? JSON.stringify([active.provider, active.name]) : "";
  }, [models]);
  const activeSelection = selected || defaultValue;

  const setBusyState = (value: boolean) => {
    setBusy(value);
    onBusyChange(value);
  };

  const runAction = (action: NoteAiAction) => {
    if (busy) return;
    if (action === "ai-update" && !instruction.trim()) {
      toast.error("Describe what the AI should change");
      inputRef.current?.focus();
      return;
    }
    if (!activeSelection) {
      toast.error("No model available — activate a model first");
      return;
    }
    const [provider, model] = JSON.parse(activeSelection) as [string, string];

    setBusyState(true);
    let full = "";
    abortRef.current = notesStream.run(
      noteId,
      action,
      { instruction: instruction.trim() || undefined, provider, model },
      {
        onStart: () => {},
        onChunk: ({ delta }) => {
          full += delta;
          onContent(full);
        },
        onDone: () => {
          setBusyState(false);
          setInstruction("");
          onSaved();
        },
        onError: (message) => {
          setBusyState(false);
          toast.error(message);
        },
      },
    );
  };

  // Execute a command handed down from the Cmd+P palette.
  useEffect(() => {
    if (!pendingCommand) return;
    if (pendingCommand === "focus") inputRef.current?.focus();
    else runAction(pendingCommand);
    onCommandHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommand]);

  const handleStop = () => {
    abortRef.current?.abort();
    setBusyState(false);
  };

  return (
    <div className="flex shrink-0 items-center gap-x-2 border-b border-neutral-800 bg-neutral-900/40 px-4 py-2">
      <SparklesIcon className="size-4 shrink-0 text-neutral-400" />
      <input
        ref={inputRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") runAction("ai-update");
        }}
        disabled={busy}
        placeholder="Ask AI to rewrite this note… (e.g. add a mermaid diagram of the flow)"
        className="min-w-0 flex-1 bg-transparent para-small-medium outline-none placeholder:text-neutral-500 disabled:opacity-50"
      />
      <Select value={activeSelection} onValueChange={setSelected} disabled={busy}>
        <SelectTrigger
          size="sm"
          className="h-8 w-52 shrink-0 gap-1.5 rounded-lg border-neutral-700 bg-neutral-900 caption-small-regular text-white! shadow-none data-placeholder:text-neutral-500 focus-visible:border-neutral-500 focus-visible:ring-0"
        >
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          side="bottom"
          align="end"
          className="border-neutral-700 bg-neutral-900 text-white [--accent-foreground:var(--color-white)] [--accent:var(--color-neutral-700)]"
        >
          {providerOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <ModelOptionLabel
                name={option.name}
                modalities={option.modalities}
                providerLabel={option.providerLabel}
                providerClassName={option.providerClassName}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy ? (
        <button
          type="button"
          onClick={handleStop}
          aria-label="Stop generating"
          className="flex shrink-0 cursor-pointer items-center gap-x-1.5 rounded-lg bg-white px-2.5 py-1 caption-small-medium text-black hover:bg-neutral-200"
        >
          <SquareIcon className="size-3 fill-current" />
          Stop
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-x-1">
          <AiActionButton
            label="Rewrite"
            title="Apply the instruction to the note"
            icon={WandSparklesIcon}
            onClick={() => runAction("ai-update")}
          />
          <AiActionButton
            label="Summarize"
            title="Add or refresh a summary section"
            icon={ListPlusIcon}
            onClick={() => runAction("summarize")}
          />
          <AiActionButton
            label="Continue"
            title="Continue writing from the end"
            icon={ArrowRightIcon}
            onClick={() => runAction("continue")}
          />
        </div>
      )}
    </div>
  );
};

const AiActionButton = ({
  label,
  title,
  icon: Icon,
  onClick,
}: {
  label: string;
  title: string;
  icon: typeof SparklesIcon;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      "flex cursor-pointer items-center gap-x-1.5 rounded-lg px-2.5 py-1 caption-small-medium",
      "text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white",
    )}
  >
    <Icon className="size-3.5" />
    {label}
  </button>
);

export default AiBar;
