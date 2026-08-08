import { WaypointsIcon, XIcon } from "lucide-react";
import SidebarToggle from "@/components/common/SidebarToggle";
import { GRAPH_RENDERERS } from "@/modules/notes/constants";
import type { GraphRenderer } from "@/modules/notes/types";
import { cn } from "@/lib/utils";

interface NotesGraphHeaderProps {
  noteListOpen: boolean;
  onToggleNoteList: () => void;
  graphRenderer: GraphRenderer;
  onGraphRendererChange: (renderer: GraphRenderer) => void;
  onClose: () => void;
}

/** Graph view's top band — same shape as the editor's toolbar, so the explorer toggle never moves. */
const NotesGraphHeader = ({
  noteListOpen,
  onToggleNoteList,
  graphRenderer,
  onGraphRendererChange,
  onClose,
}: NotesGraphHeaderProps) => (
  <div className="flex h-11.5 shrink-0 items-center gap-x-2 border-b border-neutral-800 px-2 pt-2 pb-2">
    <SidebarToggle isOpen={noteListOpen} onToggle={onToggleNoteList} label="note explorer" />
    <WaypointsIcon className="size-4.5 text-neutral-400" />
    <h1 className="para-medium-semibold">Graph view</h1>

    <div className="ml-auto flex shrink-0 items-center gap-x-1">
      {/* Same segmented control as the editor's source/split/preview switch. */}
      <div className="mr-2 flex items-center rounded-lg bg-neutral-900 p-0.5">
        {GRAPH_RENDERERS.map(({ renderer: mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onGraphRendererChange(mode)}
            aria-label={label}
            title={label}
            className={cn(
              "cursor-pointer rounded-md px-2 py-1.5 text-neutral-400 transition-colors hover:text-white",
              graphRenderer === mode && "bg-neutral-700 text-white",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close graph view"
        className="cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
      >
        <XIcon className="size-4.5" />
      </button>
    </div>
  </div>
);

export default NotesGraphHeader;
