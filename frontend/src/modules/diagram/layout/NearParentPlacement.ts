import type { LayoutStrategy } from "@/modules/diagram/layout/LayoutStrategy";
import type { LayoutEntry, NodeId, SemEdge } from "@/modules/diagram/types";

/** Assumed footprint for nodes with auto size (w/h 0) when testing overlap. */
const DEFAULT_W = 180;
const DEFAULT_H = 64;
const GAP_X = 80;
const GAP_Y = 24;

/**
 * The deliberately dumb v1 strategy: a new node lands right of its first
 * already-placed neighbour (its "parent"), then nudges downward until it
 * overlaps nothing. Parentless nodes start at the origin and nudge from there.
 * Crossing-minimization is explicitly NOT this strategy's job.
 */
export const nearParentPlacement: LayoutStrategy = {
  place(newIds, frozen, edges) {
    const placed: Record<NodeId, LayoutEntry> = { ...frozen };
    const placements: Record<NodeId, LayoutEntry> = {};

    for (const id of newIds) {
      const parent = findPlacedNeighbour(id, edges, placed);
      const startX = parent ? parent.x + (parent.w > 0 ? parent.w : DEFAULT_W) + GAP_X : 0;
      let y = parent ? parent.y : 0;
      while (overlapsAny(startX, y, placed)) y += DEFAULT_H + GAP_Y;

      const entry: LayoutEntry = { x: startX, y, w: 0, h: 0 };
      placed[id] = entry;
      placements[id] = entry;
    }
    return placements;
  },
};

/** First edge endpoint that already has a position — nodes placed earlier in this run count. */
function findPlacedNeighbour(
  id: NodeId,
  edges: SemEdge[],
  placed: Record<NodeId, LayoutEntry>,
): LayoutEntry | undefined {
  for (const edge of edges) {
    if (edge.target === id && placed[edge.source]) return placed[edge.source];
    if (edge.source === id && placed[edge.target]) return placed[edge.target];
  }
  return undefined;
}

function overlapsAny(x: number, y: number, placed: Record<NodeId, LayoutEntry>): boolean {
  return Object.values(placed).some((entry) => {
    const w = entry.w > 0 ? entry.w : DEFAULT_W;
    const h = entry.h > 0 ? entry.h : DEFAULT_H;
    return x < entry.x + w && x + DEFAULT_W > entry.x && y < entry.y + h && y + DEFAULT_H > entry.y;
  });
}
