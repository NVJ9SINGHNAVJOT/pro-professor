import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/common/toast";
import { ROUTES } from "@/constants/routes";
import { useApi } from "@/hooks/useApi";
import store, { useAppDispatch, useAppSelector } from "@/redux/store";
import { diagramsRoute, type DiagramSummary } from "@/services/operations/diagrams/diagrams.route";
import { buildSavePayload, parseLoadedDiagram } from "@/modules/diagram/persistence/bundleIO";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";
import { diagramClosed } from "@/modules/diagram/model/actions";
import { selectDiagramDoc } from "@/modules/diagram/model/selectors";
import DiagramAiBar from "@/modules/diagram/components/DiagramAiBar";
import { cn } from "@/lib/utils";

// Lazy like FlowBlock: the canvas carries the React Flow runtime + styles.
const DiagramCanvas = lazy(() => import("@/modules/diagram/renderer/DiagramCanvas"));

/** Diagram list + editable canvas. New diagrams start from the sample starter (AI editing arrives in Phase 4). */
const DiagramsScreen = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const doc = useAppSelector(selectDiagramDoc);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);

  const { execute: fetchDiagrams } = useApi(diagramsRoute.getDiagrams);
  const { execute: fetchDiagram } = useApi(diagramsRoute.getDiagram);
  const { execute: createDiagram } = useApi(diagramsRoute.createDiagram);
  const { execute: updateDiagram, loading: saving } = useApi(diagramsRoute.updateDiagram);
  const { execute: deleteDiagram } = useApi(diagramsRoute.deleteDiagram);

  const refreshList = async () => {
    const res = await fetchDiagrams();
    if (!res.error) setDiagrams(res.response.data.diagrams);
  };

  useEffect(() => {
    refreshList();
    return () => {
      dispatch(diagramClosed());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (id: number) => {
    const res = await fetchDiagram(id);
    if (res.error) {
      toast.error("Failed to load diagram");
      return;
    }
    const parsed = parseLoadedDiagram(res.response.data);
    if ("errors" in parsed) {
      toast.error(`Invalid diagram: ${parsed.errors[0]}`);
      return;
    }
    dispatch(parsed.action);
  };

  // /diagrams/:diagramId deep link (embeds' edit button, reload) opens that diagram
  useEffect(() => {
    const id = Number(diagramId);
    if (diagramId && Number.isFinite(id)) open(id);
    else dispatch(diagramClosed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  const create = async () => {
    const res = await createDiagram({ title: "Untitled Diagram", content: makeSampleBundle() });
    if (res.error) {
      toast.error("Failed to create diagram");
      return;
    }
    await refreshList();
    navigate(ROUTES.DIAGRAMS_DETAIL(res.response.data.id));
  };

  const save = async (snapshot = false) => {
    if (doc.id === null) return;
    const built = buildSavePayload(store.getState());
    if ("errors" in built) {
      toast.error(`Cannot save: ${built.errors[0]}`);
      return;
    }
    const res = await updateDiagram(doc.id, { ...built.payload, ...(snapshot ? { snapshot: true } : {}) });
    if (res.error) {
      toast.error("Failed to save diagram");
      return;
    }
    toast.success("Diagram saved");
    refreshList();
  };

  const remove = async (id: number) => {
    const res = await deleteDiagram(id);
    if (res.error) {
      toast.error("Failed to delete diagram");
      return;
    }
    if (doc.id === id) navigate(ROUTES.DIAGRAMS);
    refreshList();
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ── List ── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
          <span className="caption-small-medium text-neutral-300">Diagrams</span>
          <button
            type="button"
            onClick={create}
            aria-label="New diagram"
            className="cursor-pointer rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <Plus size={16} />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {diagrams.map((diagram) => (
            <li key={diagram.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => navigate(ROUTES.DIAGRAMS_DETAIL(diagram.id))}
                className={cn(
                  "min-w-0 flex-1 cursor-pointer truncate px-3 py-1.5 text-left caption-small-regular hover:bg-neutral-900",
                  doc.id === diagram.id ? "text-sky-400" : "text-neutral-300",
                )}
              >
                {diagram.title}
              </button>
              <button
                type="button"
                onClick={() => remove(diagram.id)}
                aria-label={`Delete ${diagram.title}`}
                className="mr-2 hidden cursor-pointer rounded-md p-1 text-neutral-500 hover:text-red-400 group-hover:block"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {diagrams.length === 0 && (
            <li className="px-3 py-2 caption-small-regular text-neutral-500">No diagrams yet — create one.</li>
          )}
        </ul>
      </aside>

      {/* ── Canvas ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {doc.loaded ? (
          <>
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
              <span className="caption-small-medium text-neutral-200">{doc.title}</span>
              <button
                type="button"
                onClick={() => save()}
                disabled={saving}
                className="cursor-pointer rounded-md border border-neutral-700 px-3 py-1 caption-small-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {doc.id !== null && (
              // AI edit applies to the store; a valid patch is then saved with a revision snapshot
              <DiagramAiBar diagramId={doc.id} onApplied={() => save(true)} />
            )}
            <Suspense
              fallback={<span className="p-4 caption-small-regular text-neutral-500">Loading canvas…</span>}
            >
              <DiagramCanvas className="m-4 h-auto flex-1" />
            </Suspense>
          </>
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
