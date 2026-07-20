import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { SquarePen } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { diagramsRoute } from "@/services/operations/diagrams/diagrams.route";
import { isDiagramScene } from "@/modules/diagram/persistence/bundleIO";
import { ROUTES } from "@/constants/routes";

interface DiagramEmbedProps {
  /** The diagram's title — `![[Auth Flow.diagram]]` embeds the diagram titled "Auth Flow". */
  title: string;
}

/**
 * `![[name.diagram]]` transclusion: renders the saved Excalidraw scene as a
 * read-only SVG (via `exportToSvg`, so multiple embeds on a note stay cheap —
 * no editor mounts). Editing goes through the editor screen via the header
 * button; the embed shows the saved state on next render.
 */
const DiagramEmbed = ({ title }: DiagramEmbedProps) => {
  const navigate = useNavigate();
  const { execute: fetchByTitle } = useApi(diagramsRoute.getDiagramByTitle);
  const [id, setId] = useState<number | null>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setId(null);
    setSvgHtml(null);
    setFailed(false);
    (async () => {
      const res = await fetchByTitle(title);
      if (!alive) return;
      if (res.error || !isDiagramScene(res.response.data.content)) {
        setFailed(true);
        return;
      }
      const detail = res.response.data;
      try {
        const { exportToSvg, restore } = await import("@excalidraw/excalidraw");
        const scene = restore(detail.content as never, null, null);
        const svg = await exportToSvg({
          elements: scene.elements,
          appState: { ...scene.appState, exportBackground: true },
          files: scene.files,
          exportPadding: 12,
        });
        if (!alive) return;
        svg.setAttribute("style", "max-width:100%;height:auto;display:block");
        // Hand the markup to React (dangerouslySetInnerHTML) rather than mutating
        // the DOM ourselves — mixing manual DOM ops with React's reconciler here
        // makes React's cleanup call removeChild on a node it no longer owns.
        setSvgHtml(svg.outerHTML);
        setId(detail.id);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  if (failed) {
    return (
      <span className="my-2 block rounded-xl border border-dashed border-neutral-700 px-3 py-2 caption-small-regular text-neutral-500">
        Unresolved diagram: [[{title}.diagram]]
      </span>
    );
  }
  return (
    <span className="my-2 block rounded-xl border border-neutral-800">
      <span className="flex items-center justify-between px-4 py-2">
        <span className="caption-small-medium text-neutral-500">{title}</span>
        {id !== null && (
          <button
            type="button"
            onClick={() => navigate(ROUTES.DIAGRAMS_DETAIL(id))}
            aria-label={`Edit ${title}`}
            className="cursor-pointer rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <SquarePen size={14} />
          </button>
        )}
      </span>
      {svgHtml ? (
        <span className="block rounded-b-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: svgHtml }} />
      ) : (
        <span className="block p-3 caption-small-regular text-neutral-500">Loading diagram…</span>
      )}
    </span>
  );
};

export default DiagramEmbed;
