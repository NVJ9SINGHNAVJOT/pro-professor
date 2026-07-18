import type { LayoutEntry, NodeId, SemEdge } from "@/modules/diagram/types";

/**
 * Pluggable incremental placement. `place` returns entries for `newIds` ONLY —
 * a strategy never moves a frozen (already-placed) node; that is the core
 * behavioral guarantee of the AI pipeline. Dagre/ELK become later strategies
 * behind this same interface.
 */
export interface LayoutStrategy {
  place(newIds: NodeId[], frozen: Record<NodeId, LayoutEntry>, edges: SemEdge[]): Record<NodeId, LayoutEntry>;
}
