import { XIcon } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import {
  resetGraphView,
  setGraphLocalDepth,
  setGraphQuery,
  toggleGraphOrphans,
  toggleGraphPanel,
  toggleGraphTagColors,
  unpinAllGraphNodes,
} from "@/redux/slices/notesGraphSlice";
import { GRAPH_LOCAL_DEPTH_MAX } from "@/modules/notes/constants";
import { tagColor } from "@/modules/notes/utils/graph";
import { cn } from "@/lib/utils";

/**
 * The interactive graph's controls, floating over the canvas. Everything here narrows *what is
 * shown*, never how it is laid out — the simulation always holds the whole network, so a filter
 * fades nodes rather than moving them.
 */
interface GraphFilterPanelProps {
  /** Every tag in the graph, for the legend. */
  tags: string[];
  /** Local-graph mode needs a note to be the centre of. */
  hasOpenNote: boolean;
}

const GraphFilterPanel = ({ tags, hasOpenNote }: GraphFilterPanelProps) => {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.notesGraph.filters);
  const pinnedCount = useAppSelector((state) => state.notesGraph.pinnedIds.length);

  const rowClass = "flex items-center justify-between gap-x-3";
  const labelClass = "caption-small-regular text-neutral-400";

  return (
    <div
      // Clicks here must not reach the canvas underneath, which would read them as a pan.
      onPointerDown={(event) => event.stopPropagation()}
      // Hangs directly under the toolbar's filter button rather than off in the opposite corner —
      // the panel belongs to that button, and the eye shouldn't have to cross the canvas to find it.
      className="absolute top-12 right-2 flex w-64 flex-col gap-y-3 rounded-lg border border-neutral-700 bg-neutral-900/95 p-3 backdrop-blur"
    >
      <div className={rowClass}>
        <span className="caption-small-medium text-neutral-300">Filters</span>
        <button
          type="button"
          onClick={() => dispatch(toggleGraphPanel())}
          aria-label="Close filters"
          className="cursor-pointer rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <input
        type="search"
        value={filters.query}
        onChange={(event) => dispatch(setGraphQuery(event.target.value))}
        placeholder="Filter by title…"
        aria-label="Filter notes by title"
        autoFocus
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 caption-small-regular text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-500"
      />

      <label className={cn(rowClass, "cursor-pointer")}>
        <span className={labelClass}>Hide unlinked notes</span>
        <input
          type="checkbox"
          checked={filters.hideOrphans}
          onChange={() => dispatch(toggleGraphOrphans())}
          className="size-3.5 cursor-pointer accent-neutral-400"
        />
      </label>

      <label className={cn(rowClass, "cursor-pointer")}>
        <span className={labelClass}>Colour by tag</span>
        <input
          type="checkbox"
          checked={filters.colorByTag}
          onChange={() => dispatch(toggleGraphTagColors())}
          className="size-3.5 cursor-pointer accent-neutral-400"
        />
      </label>

      {filters.colorByTag && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-x-1 caption-small-regular text-neutral-400">
              {/* Inline style, not a class: this reads the same array the canvas paints from, which
                  is the whole point — one source of truth for both. */}
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tagColor(tag) }} />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-y-1.5">
        <div className={rowClass}>
          <span className={cn(labelClass, !hasOpenNote && "text-neutral-600")}>Local graph</span>
          <span
            className={cn("caption-small-regular tabular-nums", hasOpenNote ? "text-neutral-300" : "text-neutral-600")}
          >
            {filters.localDepth === 0 ? "off" : `${filters.localDepth} hop${filters.localDepth > 1 ? "s" : ""}`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={GRAPH_LOCAL_DEPTH_MAX}
          step={1}
          value={filters.localDepth}
          disabled={!hasOpenNote}
          onChange={(event) => dispatch(setGraphLocalDepth(Number(event.target.value)))}
          aria-label="Local graph depth"
          className="w-full cursor-pointer accent-neutral-400 disabled:cursor-not-allowed disabled:accent-neutral-700"
        />
        {/* Without this the slider just looks broken on `/notes` — there is no note to centre on. */}
        {!hasOpenNote && (
          <span className="caption-small-regular text-neutral-600">Open a note to use the local graph</span>
        )}
      </div>

      <div className="flex items-center gap-x-2 border-t border-neutral-800 pt-2">
        <button
          type="button"
          onClick={() => dispatch(unpinAllGraphNodes())}
          disabled={pinnedCount === 0}
          className="cursor-pointer rounded-md px-2 py-1 caption-small-regular text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
        >
          Unpin all{pinnedCount > 0 ? ` (${pinnedCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => dispatch(resetGraphView())}
          className="ml-auto cursor-pointer rounded-md px-2 py-1 caption-small-regular text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          Reset view
        </button>
      </div>
    </div>
  );
};

export default GraphFilterPanel;
