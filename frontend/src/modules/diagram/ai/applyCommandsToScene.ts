import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramCommand } from "@/modules/diagram/types";
import { applyCommands, buildSkeletons, placeNewNodes, readSemantics } from "@/modules/diagram/ai/sceneSemantics";

interface OwnedElement {
  id: string;
  containerId?: string | null;
  boundElements?: readonly { id: string; type: string }[] | null;
  customData?: { nodeId?: string; edgeId?: string } | null;
}

/**
 * Applies a validated command list to the live scene: read the graph, fold the
 * commands, lay out new nodes, rebuild the semantic elements, and commit — as a
 * SINGLE undoable `updateScene`. Only the semantic (customData-tagged) elements
 * and their bound labels are regenerated; any freehand/other elements the user
 * drew are preserved untouched. Positions of existing nodes survive (read back
 * from the scene), so hand-tuned layout is not destroyed.
 */
export function applyCommandsToScene(
  api: ExcalidrawImperativeAPI,
  ops: DiagramCommand[],
): { ok: true } | { ok: false; errors: string[] } {
  const elements = api.getSceneElements() as readonly OwnedElement[];
  const base = readSemantics(elements);

  const applied = applyCommands(base, ops);
  if (!applied.ok) return applied;

  const newIds = new Set(applied.newNodeIds);
  placeNewNodes(applied.semantics, newIds);
  const converted = convertToExcalidrawElements(buildSkeletons(applied.semantics), { regenerateIds: false });

  // Re-stamp our identity tags after conversion. convertToExcalidrawElements does
  // not carry `customData` through onto arrows, so without this the NEXT edit
  // can't recognise these arrows as edges and would drop every connection. Ids
  // are preserved (regenerateIds:false), so id === nodeId/edgeId here.
  const nodeIds = new Set(applied.semantics.nodes.map((n) => n.id));
  const edgeIds = new Set(applied.semantics.edges.map((e) => e.id));
  const rebuilt = converted.map((el) => {
    if (nodeIds.has(el.id)) return { ...el, customData: { ...el.customData, nodeId: el.id } };
    if (edgeIds.has(el.id)) return { ...el, customData: { ...el.customData, edgeId: el.id } };
    return el;
  });

  // Keep every element that is NOT part of our semantic graph (freehand, images,
  // stray text) — semantic shapes/arrows and their bound labels are regenerated.
  const semIds = new Set(elements.filter((el) => el.customData?.nodeId || el.customData?.edgeId).map((el) => el.id));
  const ownedByBinding = new Set<string>();
  for (const el of elements) {
    if (!semIds.has(el.id)) continue;
    for (const bound of el.boundElements ?? []) ownedByBinding.add(bound.id);
  }
  const extras = elements.filter(
    (el) => !semIds.has(el.id) && !ownedByBinding.has(el.id) && !(el.containerId && semIds.has(el.containerId)),
  );

  api.updateScene({
    elements: [...(extras as never[]), ...rebuilt],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return { ok: true };
}
