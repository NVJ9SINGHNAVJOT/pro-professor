import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { PRO_FONT_FAMILY, PRO_ROUGHNESS } from "@/modules/diagram/persistence/bundleIO";

interface TaggableElement {
  id: string;
  type: string;
  text?: string;
  boundElements?: readonly { id: string; type: string }[] | null;
  customData?: Record<string, unknown> | null;
}

const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

function slug(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "node";
  let id = base;
  let n = 1;
  while (used.has(id)) id = `${base}-${++n}`;
  used.add(id);
  return id;
}

/**
 * Tags Mermaid-produced elements with our `customData` ids so the graph becomes
 * editable by later command edits (nodeId = slug of the shape's label), and
 * restyles them to a professional (non-hand-drawn) look: roughness 0 on every
 * element, a normal sans font on text (Mermaid emits the sketchy default).
 */
function tagSemantics<T extends TaggableElement>(elements: readonly T[]): T[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const usedNodeIds = new Set<string>();
  const usedEdgeIds = new Set<string>();
  return elements.map((el) => {
    const pro = { roughness: PRO_ROUGHNESS, ...(el.type === "text" ? { fontFamily: PRO_FONT_FAMILY } : {}) };
    if (SHAPE_TYPES.has(el.type)) {
      let label = el.customData?.label as string | undefined;
      for (const bound of el.boundElements ?? []) {
        if (bound.type === "text") label = byId.get(bound.id)?.text ?? label;
      }
      const nodeId = slug(label ?? el.id, usedNodeIds);
      return { ...el, ...pro, customData: { ...el.customData, nodeId, label: label ?? "" } };
    }
    if (el.type === "arrow") {
      return { ...el, ...pro, customData: { ...el.customData, edgeId: slug(`e-${el.id}`, usedEdgeIds) } };
    }
    return { ...el, ...pro };
  });
}

/**
 * From-scratch generation: parse a Mermaid flowchart into editable Excalidraw
 * elements and replace the scene with them (one undoable step). Non-flowchart
 * Mermaid renders as an image element — still valid, just not graph-editable.
 */
export async function applyMermaid(
  api: ExcalidrawImperativeAPI,
  definition: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  try {
    const { elements: skeleton } = await parseMermaidToExcalidraw(definition, { themeVariables: { fontSize: "16px" } });
    const converted = convertToExcalidrawElements(skeleton);
    const tagged = tagSemantics(converted as unknown as TaggableElement[]);
    api.updateScene({
      elements: tagged as never[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(tagged as never[], { fitToContent: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : "Mermaid parse failed"] };
  }
}
