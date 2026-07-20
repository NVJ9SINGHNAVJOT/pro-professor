import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Trash2, SquarePenIcon } from "lucide-react";
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
                onClick={() => navigate(ROUTES.DIAGRAMS_DETAIL(diagram.id))}
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
