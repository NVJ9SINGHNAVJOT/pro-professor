import { useRef, useState, type ReactNode } from "react";
import { ListTreeIcon, SparklesIcon, XIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NoteRightPanel } from "@/modules/notes/types";
import { RAIL_DEFAULT_WIDTH, RAIL_MAX_WIDTH, RAIL_MIN_WIDTH } from "@/modules/notes/constants";
import { cn } from "@/lib/utils";

const TABS: { id: Exclude<NoteRightPanel, null>; label: string; icon: LucideIcon }[] = [
  { id: "context", label: "Context", icon: ListTreeIcon },
  { id: "ai", label: "AI", icon: SparklesIcon },
];

interface RightRailProps {
  /** Which tab is showing; the rail isn't rendered at all when null. */
  active: Exclude<NoteRightPanel, null>;
  onSelect: (panel: Exclude<NoteRightPanel, null>) => void;
  onClose: () => void;
  context: ReactNode;
  ai: ReactNode;
  /** Markdown problems in the buffer — badged on the Context tab so they're visible unopened. */
  problemCount: number;
}

/**
 * Right pane — the note's context and its chat, as two tabs of one rail rather than two panels
 * competing with the editor for width. Owns the pane chrome; the tab bodies are plain content.
 */
const RightRail = ({ active, onSelect, onClose, context, ai, problemCount }: RightRailProps) => {
  const asideRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(RAIL_DEFAULT_WIDTH);

  // Same approach as SplitPane's divider, measured from the rail's own right edge so it doesn't
  // assume the rail is flush with the viewport.
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (event: MouseEvent) => {
      const rect = asideRef.current?.getBoundingClientRect();
      if (!rect) return;
      setWidth(Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, rect.right - event.clientX)));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      className="flex h-full shrink-0 overflow-hidden border-l border-neutral-800 bg-chat-sidebar text-white"
    >
      <div
        onMouseDown={handleDividerMouseDown}
        role="separator"
        aria-orientation="vertical"
        className="w-1 shrink-0 cursor-col-resize bg-neutral-800 transition-colors hover:bg-neutral-500"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11.5 shrink-0 items-center gap-x-1 border-b border-neutral-800 px-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "flex cursor-pointer items-center gap-x-1.5 rounded-lg px-2.5 py-1.5 caption-small-medium transition-colors",
                active === id ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {label}
              {id === "context" && problemCount > 0 && (
                <span
                  title={`${problemCount} Markdown ${problemCount === 1 ? "problem" : "problems"}`}
                  className="rounded-full bg-amber-400/15 px-1.5 caption-small-medium text-amber-400"
                >
                  {problemCount}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            title="Close panel"
            className="ml-auto cursor-pointer rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Both tabs stay mounted: the chat is component state, so unmounting it on a tab switch
            would throw the thread away. */}
        <div className={cn("flex min-h-0 flex-1 flex-col", active !== "context" && "hidden")}>{context}</div>
        <div className={cn("flex min-h-0 flex-1 flex-col", active !== "ai" && "hidden")}>{ai}</div>
      </div>
    </aside>
  );
};

export default RightRail;
