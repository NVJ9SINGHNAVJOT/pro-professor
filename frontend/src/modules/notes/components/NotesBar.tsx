import type { RefObject } from "react";
import {
  HistoryIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SaveIcon,
  SparklesIcon,
  SquareIcon,
  WaypointsIcon,
} from "lucide-react";
import EditableTitle from "@/components/common/EditableTitle";
import SidebarToggle from "@/components/common/SidebarToggle";
import { VIEW_MODES } from "@/modules/notes/constants";
import { cn } from "@/lib/utils";
import type { NoteRightPanel, NoteViewMode } from "@/modules/notes/types";
import type { useNoteAi } from "@/modules/notes/hooks/useNoteAi";

/** How much of a fragment action's live output the status strip shows. */
const PREVIEW_TAIL_CHARS = 160;

interface NotesBarProps {
  ai: ReturnType<typeof useNoteAi>;
  /** False on an unsaved draft: everything needing a note id is disabled until the first save. */
  hasNote: boolean;
  /** The note's title, renamed in place here — its own request, not part of the save. */
  title: string;
  setTitle: (title: string) => void;
  savedTitle: string;
  onRenameTitle: (title: string) => void;
  dirty: boolean;
  saving: boolean;
  viewMode: NoteViewMode;
  setViewMode: (mode: NoteViewMode) => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  historyBtnRef: RefObject<HTMLButtonElement | null>;
  /** Which right-rail tab is showing, or null when the rail is closed. */
  rightPanel: NoteRightPanel;
  setRightPanel: (panel: NoteRightPanel) => void;
  noteListOpen: boolean;
  onToggleNoteList: () => void;
  setGraphOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  onSave: () => void;
}

const NotesBar = ({
  ai,
  hasNote,
  title,
  setTitle,
  savedTitle,
  onRenameTitle,
  dirty,
  saving,
  viewMode,
  setViewMode,
  historyOpen,
  setHistoryOpen,
  historyBtnRef,
  rightPanel,
  setRightPanel,
  noteListOpen,
  onToggleNoteList,
  setGraphOpen,
  onSave,
}: NotesBarProps) => {
  return (
    <>
      <div className="flex h-11.5 shrink-0 items-center gap-x-2 border-b border-neutral-800 px-2 pt-2 pb-2">
        <SidebarToggle isOpen={noteListOpen} onToggle={onToggleNoteList} label="note explorer" />
        <EditableTitle
          value={title}
          savedValue={savedTitle}
          onChange={setTitle}
          onCommit={onRenameTitle}
          placeholder="Untitled"
        />

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
              "flex w-[105px] cursor-pointer items-center gap-x-1.5 rounded-lg px-2.5 py-1 para-small-medium transition-colors ease-in-out",
              dirty && !saving
                ? "bg-white text-black hover:bg-neutral-200"
                : "cursor-not-allowed bg-neutral-800 text-neutral-500",
            )}
          >
            <SaveIcon className="size-4 items-start" />
            <span className="flex-1 text-center">{saving ? "Saving…" : "Save"}</span>
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
          {/* Opens the rail's AI tab — and doubles as Stop, because the rail can be closed while
              the model runs and this is then the only control left on screen. Not gated on
              hasNote: the chat half works on an unsaved draft, only the note actions inside don't. */}
          {ai.busy ? (
            <button
              type="button"
              onClick={ai.stop}
              aria-label="Stop generating"
              title="Stop"
              className="flex h-8 shrink-0 cursor-pointer items-center gap-x-1.5 rounded-lg bg-white px-2.5 caption-small-medium text-black hover:bg-neutral-200"
            >
              <SquareIcon className="size-3 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRightPanel(rightPanel === "ai" ? null : "ai")}
              aria-label="Toggle AI panel"
              title="AI — actions and chat for this note"
              className={cn(
                "cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800",
                rightPanel === "ai" && "bg-neutral-800 text-white",
              )}
            >
              <SparklesIcon className="size-4.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setRightPanel(rightPanel === null ? "context" : null)}
            aria-label="Toggle context panel"
            className="cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
          >
            {rightPanel !== null ? (
              <PanelRightCloseIcon className="size-4.5" />
            ) : (
              <PanelRightOpenIcon className="size-4.5" />
            )}
          </button>
        </div>
      </div>

      {/* Fragment actions don't write to the editor, so without this the app looks frozen while
          the model works. Shows the tail, since that's where the text is growing. */}
      {ai.preview !== null && (
        <div className="flex h-8 shrink-0 items-center gap-x-2 border-b border-neutral-800 bg-neutral-900/70 px-4">
          <SparklesIcon className="size-3.5 shrink-0 animate-pulse text-neutral-400" />
          <span className="truncate caption-small-regular text-neutral-400">
            {ai.preview.slice(-PREVIEW_TAIL_CHARS) || "Generating…"}
          </span>
        </div>
      )}
    </>
  );
};

export default NotesBar;
