import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { SquarePen } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { diagramsRoute } from "@/services/operations/diagrams/diagrams.route";
import { validateBundle } from "@/modules/diagram/schema/validate";
import { toFlowEdges, toFlowNodes } from "@/modules/diagram/adapter/ReactFlowAdapter";
import { ROUTES } from "@/constants/routes";
import type { DiagramBundle } from "@/modules/diagram/types";

const DiagramRenderer = lazy(() => import("@/modules/diagram/renderer/DiagramRenderer"));

interface DiagramEmbedProps {
  /** The diagram's title — `![[Auth Flow.diagram]]` embeds the diagram titled "Auth Flow". */
  title: string;
}

/**
 * `![[name.diagram]]` transclusion: renders the diagram read-only (ephemeral —
 * drags are never committed). Editing goes through the editor screen via the
 * header button; the embed shows the saved state on next render. Multiple
 * embeds can coexist because none of them touch the single-open-diagram store.
 */
const DiagramEmbed = ({ title }: DiagramEmbedProps) => {
  const navigate = useNavigate();
  const { execute: fetchByTitle } = useApi(diagramsRoute.getDiagramByTitle);
  const [resolved, setResolved] = useState<{ id: number; bundle: DiagramBundle } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      setResolved(null);
      setFailed(false);
      const res = await fetchByTitle(title);
      if (res.error) {
        setFailed(true);
        return;
      }
      const detail = res.response.data;
      const result = validateBundle(detail.content);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setResolved({ id: detail.id, bundle: result.bundle });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  if (failed) {
    return (
      <span className="my-2 block rounded-xl border border-dashed border-neutral-700 px-3 py-2 caption-small-regular text-neutral-500">
        Unresolved diagram: [[{title}.diagram]]
      </span>
    );
  }
  if (!resolved) {
    return (
      <span className="my-2 block rounded-xl border border-neutral-800 p-3 caption-small-regular text-neutral-500">
        Loading diagram…
      </span>
    );
  }
  return (
    <span className="my-2 block rounded-xl border border-neutral-800">
      <span className="flex items-center justify-between px-4 py-2">
        <span className="caption-small-medium text-neutral-500">{resolved.bundle && title}</span>
        <button
          type="button"
          onClick={() => navigate(ROUTES.DIAGRAMS_DETAIL(resolved.id))}
          aria-label={`Edit ${title}`}
          className="cursor-pointer rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <SquarePen size={14} />
        </button>
      </span>
      <Suspense
        fallback={<span className="block p-3 caption-small-regular text-neutral-500">Loading canvas…</span>}
      >
        <DiagramRenderer
          nodes={toFlowNodes(resolved.bundle.semantic.nodes, resolved.bundle.layout)}
          edges={toFlowEdges(resolved.bundle.semantic.edges)}
          ephemeral
          className="h-72 rounded-t-none border-0 border-t border-neutral-800"
        />
      </Suspense>
    </span>
  );
};

export default DiagramEmbed;
