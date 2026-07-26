import type { RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightIcon,
  HistoryIcon,
  ListPlusIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SaveIcon,
  SparklesIcon,
  SquareIcon,
  WandSparklesIcon,
  WaypointsIcon,
} from "lucide-react";
import ModelSelector from "@/components/common/ModelSelector";
import { VIEW_MODES } from "@/modules/notes/constants";
import { cn } from "@/lib/utils";
import type { NoteViewMode } from "@/modules/notes/types";
import type { useNoteAi } from "@/modules/notes/hooks/useNoteAi";

interface NotesBarProps {
  ai: ReturnType<typeof useNoteAi>;
  aiInputRef: RefObject<HTMLInputElement | null>;
  /** False on an unsaved draft: everything needing a note id is disabled until the first save. */
  hasNote: boolean;
  dirty: boolean;
  saving: boolean;
  viewMode: NoteViewMode;
  setViewMode: (mode: NoteViewMode) => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  historyBtnRef: RefObject<HTMLButtonElement | null>;
  contextOpen: boolean;
  setContextOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setGraphOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  onSave: () => void;
}

const NotesBar = ({
  ai,
  aiInputRef,
  hasNote,
  dirty,
  saving,
  viewMode,
  setViewMode,
  historyOpen,
  setHistoryOpen,
  historyBtnRef,
  contextOpen,
  setContextOpen,
  setGraphOpen,
  onSave,
}: NotesBarProps) => {
  return (
    <>
      <div className="flex h-11.5 shrink-0 items-center justify-between border-b border-neutral-800 px-4 pt-2 pb-2">
        <div className="flex shrink-0 items-center gap-x-1">
          <div className="mr-2 shrink-0">
            <ModelSelector
              value={ai.activeSelection}
              onChange={ai.setSelected}
              disabled={ai.busy}
              align="start"
              filter={(m) => m.role !== "embedding" && !m.name.toLowerCase().includes("embed")}
            />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-x-1">
          {dirty && <span className="mr-2 size-2 shrink-0 rounded-full bg-amber-400" title="Unsaved changes" />}
          <button
            type="button"
            onClick={() => setGraphOpen(true)}
            aria-label="Open graph view"
            title="Graph view"
            className="mr-1 cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
          >
            <WaypointsIcon className="size-4.5" />
          </button>
          <div className="mr-2 flex items-center rounded-lg bg-neutral-900 p-0.5">
            {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-label={label}
                title={label}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1.5 text-neutral-400 transition-colors hover:text-white",
                  viewMode === mode && "bg-neutral-700 text-white",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            aria-label="Save note"
            title="Save (⌘S)"
            className={cn(
              "flex cursor-pointer items-center gap-x-1.5 rounded-lg px-2.5 py-1.5 para-small-medium transition-colors",
              dirty && !saving
                ? "bg-white text-black hover:bg-neutral-200"
                : "cursor-not-allowed bg-neutral-800 text-neutral-500",
            )}
          >
            <SaveIcon className="size-4" />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            ref={historyBtnRef}
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            disabled={!hasNote}
            aria-label="Revision history"
            title={hasNote ? "Revision history" : "Save the note first"}
            className={cn(
              "cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
              historyOpen && "bg-neutral-800 text-white",
            )}
          >
            <HistoryIcon className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={() => setContextOpen((open) => !open)}
            disabled={!hasNote}
            aria-label="Toggle context panel"
            className={cn(
              "cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
            )}
          >
            {contextOpen ? (
              <PanelRightCloseIcon className="size-4.5" />
            ) : (
              <PanelRightOpenIcon className="size-4.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-x-2 border-b border-neutral-800 bg-neutral-900/40 px-4 py-2">
        <SparklesIcon className="size-4 shrink-0 text-neutral-400" />
        <input
          ref={aiInputRef}
          value={ai.instruction}
          onChange={(e) => ai.setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ai.runAction("ai-update", () => aiInputRef.current?.focus());
          }}
          disabled={ai.busy || !hasNote}
          placeholder={
            hasNote
              ? "Ask AI to rewrite this note… (e.g. add a mermaid diagram of the flow)"
              : "Save the note to use AI on it"
          }
          className="min-w-0 flex-1 bg-transparent para-small-medium outline-none placeholder:text-neutral-500 disabled:opacity-50"
        />
        {ai.busy ? (
          <button
            type="button"
            onClick={ai.stop}
            aria-label="Stop generating"
            className="flex h-7 shrink-0 cursor-pointer items-center gap-x-1.5 rounded-lg bg-white px-2.5 caption-small-medium text-black hover:bg-neutral-200"
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
              onClick={() => ai.runAction("ai-update", () => aiInputRef.current?.focus())}
              disabled={ai.busy || !hasNote}
            />
            <AiActionButton
              label="Summarize"
              title="Add or refresh a summary section"
              icon={ListPlusIcon}
              onClick={() => ai.runAction("summarize", () => aiInputRef.current?.focus())}
              disabled={ai.busy || !hasNote}
            />
            <AiActionButton
              label="Continue"
              title="Continue writing from the end"
              icon={ArrowRightIcon}
              onClick={() => ai.runAction("continue", () => aiInputRef.current?.focus())}
              disabled={ai.busy || !hasNote}
            />
          </div>
        )}
      </div>
    </>
  );
};

const AiActionButton = ({
  label,
  title,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  title: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={cn(
      "flex h-7 cursor-pointer items-center gap-x-1.5 rounded-lg px-2.5 caption-small-medium",
      "text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed",
    )}
  >
    <Icon className="size-3.5" />
    {label}
  </button>
);

export default NotesBar;
