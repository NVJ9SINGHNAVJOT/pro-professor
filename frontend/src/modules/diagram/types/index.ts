/* ── Diagram domain types ─────────────────────────────────────────────────────
 * Diagrams are stored as Excalidraw scenes (elements + appState + files). Our
 * only additions are logical ids on `customData` (nodeId/edgeId) so AI command
 * edits can resolve "which element is Redis" across saves. The AI never emits
 * geometry — see schema/aiPatch.schema.json and ai/applyCommandsToScene.
 */

export type NodeId = string;
export type EdgeId = string;

/** The stored diagram document — the canonical Excalidraw scene shape. */
export interface DiagramScene {
  type: "excalidraw";
  version: number;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** Node geometries we map onto native Excalidraw shapes. */
export const SHAPE_KINDS = ["rectangle", "ellipse", "diamond"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Node styling the AI may set (CSS colors). */
export interface NodeStyle {
  fill?: string;
  textColor?: string;
  stroke?: string;
}

/** Edge styling the AI may set. */
export interface EdgeStyle {
  dashed?: boolean;
  arrow?: "none" | "end" | "both";
  color?: string;
}

/**
 * The AI command list (schema/aiPatch.schema.json). A command references nodes
 * and edges by their logical id (customData.nodeId / customData.edgeId); the
 * applier folds these onto the scene. Layout is never part of the contract.
 */
export type DiagramCommand =
  | { op: "addNode"; node: { id: NodeId; label: string; shape?: ShapeKind; style?: NodeStyle } }
  | { op: "deleteNode"; id: NodeId }
  | { op: "renameNode"; id: NodeId; label: string }
  | { op: "connectNodes"; source: NodeId; target: NodeId; label?: string; id?: EdgeId }
  | { op: "deleteEdge"; id: EdgeId }
  | { op: "styleNode"; id: NodeId; shape?: ShapeKind; style?: NodeStyle }
  | { op: "styleEdge"; id: EdgeId; style?: EdgeStyle };
