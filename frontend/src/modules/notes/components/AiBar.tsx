import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, ListPlusIcon, SparklesIcon, SquareIcon, WandSparklesIcon } from "lucide-react";
import { toast } from "@/components/common/toast";
import { SelectInput } from "@/components/inputs/SelectInput";
import { useApi } from "@/hooks/useApi";
import { useAppSelector } from "@/redux/store";
import { notesRoute } from "@/services/operations/notes/notes.route";
import { notesStream, type NoteAiAction } from "@/services/operations/notes/notes.stream";
import { cn } from "@/lib/utils";

const CLAUDE_VALUE = "claude";

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
  const { execute: fetchAiStatus } = useApi(notesRoute.getAiStatus);
  const [instruction, setInstruction] = useState("");
  const [selected, setSelected] = useState(CLAUDE_VALUE);
  const [busy, setBusy] = useState(false);
  const [claudeConfigured, setClaudeConfigured] = useState(true);
  const [claudeModel, setClaudeModel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // stop generation when the note changes or the bar unmounts
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [noteId]);

  // whether the Claude provider has an API key, so the option can say so up front
  useEffect(() => {
    (async () => {
      const res = await fetchAiStatus();
      if (!res.error) {
        setClaudeConfigured(res.response.data.claudeConfigured);
        setClaudeModel(res.response.data.claudeModel);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providerOptions = useMemo(
    () => [
      {
        value: CLAUDE_VALUE,
        label: claudeConfigured ? `Claude (${claudeModel || "API"})` : "Claude — no API key",
      },
      ...models.map((model) => ({
        value: JSON.stringify([model.provider, model.name]),
        label: model.name,
      })),
    ],
    [models, claudeConfigured, claudeModel],
  );

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
    if (selected === CLAUDE_VALUE && !claudeConfigured) {
      toast.error("Anthropic API key not configured — set ANTHROPIC_API_KEY in central-server/.env");
      return;
    }
    const [provider, model] =
      selected === CLAUDE_VALUE ? [CLAUDE_VALUE, undefined] : (JSON.parse(selected) as [string, string]);

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
      <SelectInput
        options={providerOptions}
        value={selected}
        onChange={setSelected}
        readOnly={busy}
        className="w-52 shrink-0"
        buttonClassName="h-8 rounded-lg bg-neutral-900 caption-small-regular"
      />
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
