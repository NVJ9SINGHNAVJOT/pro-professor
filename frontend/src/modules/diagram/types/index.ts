/* ── Diagram domain types ─────────────────────────────────────────────────────
 * The on-row / on-wire format is a single JSON document with four namespaces:
 * `semantic` (AI-owned, no coordinates), `layout` (user-owned positions),
 * `theme` and `metadata`. React Flow never sees these types directly — the
 * adapter translates them (see docs/diagram-engine-execution-plan.md §3).
 */

export type NodeId = string;
export type EdgeId = string;

/** Registered node type names — the registry (nodes/registry.ts) keys off this list. */
export const NODE_TYPES: readonly string[] = ["service", "database", "note"];
/** Registered edge type names — the registry (edges/) keys off this list. */
export const EDGE_TYPES: readonly string[] = ["straight", "curved"];

export const DIAGRAM_SCHEMA_VERSION = "1.0.0";

export interface SemNode {
  id: NodeId;
  type: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface SemEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  type: string;
  label?: string;
}

export interface LayoutEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed?: boolean;
  z?: number;
}

export interface DiagramMetadata {
  created: string;
  updated: string;
  author?: string;
  rendererVersion: string;
}

export interface DiagramBundle {
  schemaVersion: string;
  /** AI-owned meaning — never carries coordinates. */
  semantic: { nodes: SemNode[]; edges: SemEdge[] };
  /** User-owned arrangement — keyed by node id; keys must be a subset of semantic node ids. */
  layout: Record<NodeId, LayoutEntry>;
  /** Named theme ref in v1 (e.g. "default-dark"). */
  theme: string;
  metadata: DiagramMetadata;
}
