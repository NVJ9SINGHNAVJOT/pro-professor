import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import LeftNav from "@/components/common/LeftNav";
import { toast } from "@/components/common/toast";
import { ROUTES } from "@/constants/routes";
import { useApi } from "@/hooks/useApi";
import { diagramsRoute, type DiagramSummary } from "@/services/operations/diagrams/diagrams.route";
import { makeEmptyScene } from "@/modules/diagram/persistence/sceneIO";
import { cn } from "@/lib/utils";

// Lazy: the editor carries the Excalidraw runtime + styles.
const DiagramEditor = lazy(() => import("@/modules/diagram/components/DiagramEditor"));

/** Diagram list + Excalidraw editor. New diagrams start from an empty scene. */
const DiagramsScreen = () => {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const openId = diagramId && Number.isFinite(Number(diagramId)) ? Number(diagramId) : null;
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);

  const { execute: fetchDiagrams } = useApi(diagramsRoute.getDiagrams);
  const { execute: createDiagram } = useApi(diagramsRoute.createDiagram);
  const { execute: deleteDiagram } = useApi(diagramsRoute.deleteDiagram);

  const refreshList = async () => {
    const res = await fetchDiagrams();
    if (!res.error) setDiagrams(res.response.data.diagrams);
  };

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    const res = await createDiagram({ title: "Untitled Diagram", content: makeEmptyScene() });
    if (res.error) {
      toast.error("Failed to create diagram");
      return;
    }
    await refreshList();
    navigate(ROUTES.DIAGRAMS_DETAIL(res.response.data.id));
  };

  const remove = async (id: number) => {
    const res = await deleteDiagram(id);
    if (res.error) {
      toast.error("Failed to delete diagram");
      return;
    }
    if (openId === id) navigate(ROUTES.DIAGRAMS);
    refreshList();
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ── List ── */}
      <aside className="flex w-67.5 shrink-0 flex-col border-r border-neutral-800 bg-chat-sidebar">
        <LeftNav />
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
                  openId === diagram.id ? "text-sky-400" : "text-neutral-300",
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

      {/* ── Editor ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {openId !== null ? (
          <Suspense fallback={<span className="p-4 caption-small-regular text-neutral-500">Loading canvas…</span>}>
            <DiagramEditor key={openId} diagramId={openId} onSaved={refreshList} />
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
