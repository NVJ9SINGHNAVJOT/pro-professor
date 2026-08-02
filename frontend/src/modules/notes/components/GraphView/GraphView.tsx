import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useApi } from "@/hooks/useApi";
import { useAppSelector } from "@/redux/store";
import { ROUTES } from "@/constants/routes";
import { buildGraphModel, graphSignature, noteNodeId } from "@/modules/notes/utils/graph";
import { notesRoute, type NoteLink, type NoteSummary } from "@/services/operations/notes/notes.route";
import type { GraphNode } from "@/modules/notes/types";
import MermaidGraph from "@/modules/notes/components/GraphView/MermaidGraph";

/* The interactive renderer carries d3-force and the canvas painter, so it is split out the same way
 * DiagramsScreen splits out the Excalidraw editor — nobody who only ever opens the Mermaid view
 * downloads it. This is why the folder's barrel exports the orchestrator and nothing else: a
 * re-export of ForceGraph here would pull the chunk back into the eager notes bundle. */
const ForceGraph = lazy(() => import("@/modules/notes/components/GraphView/ForceGraph"));

interface GraphViewProps {
  /** The explorer list, loaded by the parent `/notes` route. */
  notes: NoteSummary[];
  /** The note currently open, which the interactive graph highlights and centres its local view on. */
  currentNoteId: number | null;
  /** Escape leaves the interactive graph, once its filter panel is closed. */
  onClose: () => void;
}

/**
 * The note network, in either of two renderings of the same data: a generated Mermaid hierarchy
 * (the default) or an interactive force-directed graph. Both consume one shared model built by
 * `buildGraphModel`, so they can never disagree about what the network is.
 *
 * The links fetch is on demand rather than in the route loader — this whole view sits behind a
 * toggle, so `/notes` must not pay for it (see folder-structure.md § Route data loading).
 */
const GraphView = ({ notes, currentNoteId, onClose }: GraphViewProps) => {
  const navigate = useNavigate();
  const renderer = useAppSelector((state) => state.notesGraph.renderer);
  const { execute: fetchLinks } = useApi(notesRoute.getLinks);
  const [links, setLinks] = useState<NoteLink[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchLinks();
      if (!res.error) setLinks(res.response.data.links);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => (links === null ? null : buildGraphModel(notes, links)), [notes, links]);
  /* `notes` is Redux state, so saving any note hands down a new array with identical content. The
   * signature is what the interactive graph keys its layout sync on, so an unrelated save can't
   * reshuffle a graph the user just arranged by hand. */
  const signature = useMemo(() => (links === null ? "" : graphSignature(notes, links)), [notes, links]);

  /** Mirrors `useWikiHandlers`: a resolved node opens its note, an unresolved one opens the draft it would create. */
  const openNode = (node: GraphNode) => {
    /* Closing has to be explicit. Opening a node from `/notes` changes route entry and remounts the
     * screen, which resets `graphOpen` on its own — but going from `/notes/:a` to `/notes/:b` is the
     * *same* entry, so the screen survives and the graph would stay sitting on top of the note the
     * click just asked for. */
    onClose();
    if (node.noteId !== null) {
      navigate(ROUTES.NOTES_DETAIL(node.noteId));
      return;
    }
    navigate(`${ROUTES.NOTES_NEW}?title=${encodeURIComponent(node.title)}`);
  };

  return (
    // The graph is the whole view, not a block inside a document — it gets the pane's full height so
    // a wide network has room to be panned around once zoomed, rather than sitting in a strip along
    // the top. No scroll: panning is how you move around it.
    <div className="flex h-full flex-col overflow-hidden p-4">
      {model === null ? (
        <div className="flex h-full items-center justify-center gap-x-2">
          <span className="size-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
          <span className="caption-regular text-neutral-500">Loading graph…</span>
        </div>
      ) : notes.length === 0 ? (
        <p className="caption-regular text-neutral-500">No notes to graph yet</p>
      ) : renderer === "mermaid" ? (
        <MermaidGraph model={model} />
      ) : (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <span className="caption-small-regular text-neutral-500">Loading graph…</span>
            </div>
          }
        >
          <ForceGraph
            model={model}
            signature={signature}
            rootId={currentNoteId === null ? null : noteNodeId(currentNoteId)}
            onOpenNode={openNode}
            onClose={onClose}
          />
        </Suspense>
      )}
    </div>
  );
};

export default GraphView;
