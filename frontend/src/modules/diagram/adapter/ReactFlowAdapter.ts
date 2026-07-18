import { createSelector } from "@reduxjs/toolkit";
import type { Edge, Node, NodeChange } from "@xyflow/react";
import { selectLayout, selectSelection, selectSemantic } from "@/modules/diagram/model/selectors";
import { nodeSelectionChanged } from "@/modules/diagram/model/selectionSlice";
import { moveNodeCommand, resizeNodeCommand } from "@/modules/diagram/commands";
import type { AppDispatch } from "@/redux/store";
import type { LayoutEntry, NodeId, SemEdge, SemNode } from "@/modules/diagram/types";

/* ── Domain → React Flow (one-way, pure) ──────────────────────────────────────
 * React Flow is the renderer only; these conversions are the single place its
 * shapes are produced. Only RF *types* are imported here (erased at build), so
 * the adapter adds no runtime RF cost to the main bundle.
 */

export type DiagramNodeData = { label: string };
export type DiagramFlowNode = Node<DiagramNodeData>;

/** Fallback grid for nodes with no layout entry, placed below the arranged content. */
const GRID_COLS = 4;
const GRID_W = 220;
const GRID_H = 110;
const GRID_GAP = 60;

export function toFlowNodes(
  nodes: SemNode[],
  layout: Record<NodeId, LayoutEntry>,
  selectedIds: readonly NodeId[] = [],
): DiagramFlowNode[] {
  const placed = Object.values(layout);
  const baseY = placed.length > 0 ? Math.max(...placed.map((entry) => entry.y + entry.h)) + GRID_GAP : 0;
  let unplaced = 0;

  return nodes.map((node) => {
    const entry = layout[node.id];
    const flowNode: DiagramFlowNode = {
      id: node.id,
      type: node.type,
      position: entry
        ? { x: entry.x, y: entry.y }
        : { x: (unplaced % GRID_COLS) * GRID_W, y: baseY + Math.floor(unplaced / GRID_COLS) * GRID_H },
      data: { label: node.label },
    };
    if (!entry) unplaced++;
    // w/h of 0 means "position known, size auto" (fence embeds) — only pin real sizes
    if (entry && entry.w > 0 && entry.h > 0) {
      flowNode.width = entry.w;
      flowNode.height = entry.h;
    }
    if (selectedIds.includes(node.id)) flowNode.selected = true;
    return flowNode;
  });
}

export function toFlowEdges(edges: SemEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    ...(edge.label !== undefined ? { label: edge.label } : {}),
  }));
}

/* ── React Flow → domain (the GUARDED path) ───────────────────────────────────
 * RF owns transient interaction state (the canvas keeps a local mirror for
 * smooth dragging); only these commits ever reach the domain:
 *   - drag finished  → moveNodeCommand    (layout ONLY — never semantic; undoable)
 *   - resize finished → resizeNodeCommand
 *   - select/deselect → selectionSlice    (not a document mutation — no history)
 * Everything else (transient positions, RF's measure/add/remove bookkeeping)
 * is deliberately dropped. `semantic` is untouchable from here by construction.
 */
export function commitNodeChanges(changes: NodeChange[], dispatch: AppDispatch): void {
  for (const change of changes) {
    if (change.type === "position" && change.dragging === false && change.position) {
      dispatch(moveNodeCommand(change.id, change.position.x, change.position.y));
    }
    if (change.type === "dimensions" && change.resizing === false && change.dimensions) {
      dispatch(resizeNodeCommand(change.id, change.dimensions.width, change.dimensions.height));
    }
    if (change.type === "select") {
      dispatch(nodeSelectionChanged({ id: change.id, selected: change.selected }));
    }
  }
}

/* ── Memoized store selectors for the connected canvas ───────────────────── */

export const selectFlowNodes = createSelector([selectSemantic, selectLayout, selectSelection], (semantic, layout, selection) =>
  toFlowNodes(semantic.nodes, layout, selection.nodeIds),
);

export const selectFlowEdges = createSelector([selectSemantic], (semantic) => toFlowEdges(semantic.edges));
