import { lazy, Suspense, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Trash2, SquarePenIcon } from "lucide-react";
import LeftNav from "@/components/common/LeftNav";
import { toast } from "@/components/common/toast";
import { NEW_ITEM_ID, ROUTES } from "@/constants/routes";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { removeDiagram, upsertDiagram } from "@/redux/slices/diagramListSlice";
import { diagramsRoute, type DiagramDetail, type DiagramSummary } from "@/services/operations/diagrams/diagrams.route";
import { markDraftCreated } from "@/services/client/loadRoute";
import { cn } from "@/lib/utils";

// Lazy: the editor carries the Excalidraw runtime + styles.
const DiagramEditor = lazy(() => import("@/modules/diagram/components/DiagramEditor"));

/** The list row hiding inside a full diagram — a row is a strict subset of the detail. */
const summaryOf = (detail: DiagramDetail): DiagramSummary => ({
  id: detail.id,
  title: detail.title,
  updatedAt: detail.updatedAt,
});

interface DiagramsScreenProps {
  diagrams: DiagramSummary[];
  /** The diagram named in the URL; null on `/diagrams` and `/diagrams/new`. */
  diagram: DiagramDetail | null;
}

/** Diagram list + Excalidraw editor. New diagrams start from an empty scene. */
const DiagramsScreen = ({ diagrams, diagram }: DiagramsScreenProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // `/diagrams/new` — an empty canvas with no row behind it. Like a new chat, it costs no
  // request: the diagram is created by its first autosave, which turns this into `/diagrams/:id`
  // *without* remounting the screen (same route, see NEW_ITEM_ID).
  const diagramId = useParams().diagramId;
  const isDraft = diagramId === NEW_ITEM_ID;

  const { execute: deleteDiagram } = useApi(diagramsRoute.deleteDiagram);

  // The id a draft was born as. The editor reads its scene once per mount, so it must keep the
  // key it was mounted under — remounting it onto `/diagrams/:id` mid-drawing would reset
  // Excalidraw's scene and undo history.
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftGen, setDraftGen] = useState(0);
  // On that hop the loader is skipped (`markDraftCreated`), so the URL names a diagram the loader
  // never fetched — the editor holds it, and it is what the list should highlight.
  const showingDraftId = draftId !== null && diagramId === String(draftId);
  const openId = diagram?.id ?? (showingDraftId ? draftId : null);
  const editorKey = diagram === null || showingDraftId ? `new-${draftGen}` : diagram.id;

  /**
   * New diagram = an empty draft canvas. A no-op when one is already open: re-navigating to the
   * URL we're on reads as a revalidation and would refetch the list on every click.
   */
  const create = () => {
    if (isDraft) return;
    // Forget the diagram the last draft became and bump the key, or the canvas would be reused
    // as-is and the new draft would open on the previous drawing.
    setDraftId(null);
    setDraftGen((n) => n + 1);
    navigate(ROUTES.DIAGRAMS_NEW);
  };

  /** The draft's first autosave created it — give it a real URL (`onSaved` already listed it). */
  const handleCreated = (id: number) => {
    setDraftId(id);
    // Same route, so the canvas isn't remounted; the marker also keeps the loader from refetching
    // the scene the autosave just wrote.
    markDraftCreated("diagramId", id);
    navigate(ROUTES.DIAGRAMS_DETAIL(id), { replace: true });
  };

  const remove = async (id: number) => {
    const res = await deleteDiagram(id);
    if (res.error) {
      toast.error("Failed to delete diagram");
      return;
    }
    dispatch(removeDiagram(id));
    if (openId === id) navigate(ROUTES.DIAGRAMS);
  };

  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      {/* ── List ── */}
      <aside className="flex h-full w-67.5 shrink-0 flex-col gap-y-2 overflow-hidden border-r border-neutral-800 bg-chat-sidebar text-white">
        <LeftNav />
        <div className="flex h-11.5 shrink-0 items-center px-2">
          <button
            type="button"
            onClick={create}
            className="flex w-full cursor-pointer items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium hover:bg-neutral-800"
          >
            <SquarePenIcon className="size-4.5" />
            New diagram
          </button>
        </div>
        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {diagrams.length === 0 && (
            <div className="px-2 caption-regular text-neutral-500">No diagrams yet</div>
          )}
          <div className="flex flex-col gap-y-0.5">
            {diagrams.map((diagram) => (
              <button
                key={diagram.id}
                type="button"
                onClick={() => openId !== diagram.id && navigate(ROUTES.DIAGRAMS_DETAIL(diagram.id))}
                className={cn(
                  "group flex items-center justify-between gap-x-1 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-neutral-800",
                  openId === diagram.id && "bg-neutral-800"
                )}
              >
                <span className="truncate para-small-medium text-white">{diagram.title}</span>
                <div
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(diagram.id);
                  }}
                  aria-label={`Delete ${diagram.title}`}
                  className="shrink-0 cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Editor ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {diagram !== null || isDraft || showingDraftId ? (
          <Suspense fallback={<span className="p-4 caption-small-regular text-neutral-500">Loading canvas…</span>}>
            <DiagramEditor
              key={editorKey}
              diagram={diagram}
              onCreated={handleCreated}
              onSaved={(saved) => dispatch(upsertDiagram(summaryOf(saved)))}
            />
          </Suspense>
        ) : (
          <div className="flex flex-1 items-center justify-center caption-small-regular text-neutral-500">
            Select or create a diagram
          </div>
        )}
      </main>
    </div>
  );
};

export default DiagramsScreen;
