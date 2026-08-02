/** Center-pane display mode: Markdown source, split source⟷preview, or preview only. */
export type NoteViewMode = "source" | "split" | "preview";

/** One heading in the active note, for the context panel's outline. */
export interface OutlineItem {
  depth: number;
  text: string;
}

/** Which tab the right rail is showing, or null when it is closed. */
export type NoteRightPanel = "context" | "ai" | null;

/** How much of the note each chat turn carries. `auto` = the selection if there is one, else all of it. */
export type NoteChatContextMode = "auto" | "whole-note" | "none";

/** One turn in the note chat panel. Lives in component state — nothing is reloaded from the server. */
export interface NoteChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Where a chat reply goes when applied to the note. */
export type NoteApplyMode = "cursor" | "selection" | "append";

/* ── Graph view ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Which renderer the graph view is showing. `mermaid` is the generated `graph TD` definition —
 * a hierarchy, good for reading a chain of links; `interactive` is the force-directed canvas.
 */
export type GraphRenderer = "mermaid" | "interactive";

/**
 * A node's id, namespaced by kind so one string identifies it everywhere — the model, d3's
 * `forceLink.id()`, the adjacency map, and the persisted positions/pins:
 *
 * - `note:42` — a real note. Keyed on the **id**, so a rename never moves a node.
 * - `ref:some title` — an unresolved `[[target]]`, lowercased, so `[[Foo]]` and `[[foo]]` are one node.
 */
export type GraphNodeId = string;

export interface GraphNode {
  id: GraphNodeId;
  /** The note id, or null on an unresolved reference (nothing to open — it opens a draft instead). */
  noteId: number | null;
  /** Display label: the note's title, or the reference as it was written. */
  title: string;
  tags: string[];
  /** Links in **either** direction — what sizes the node and what "orphan" means. */
  degree: number;
}

export interface GraphEdge {
  source: GraphNodeId;
  target: GraphNodeId;
  /** `![[embed]]` renders differently from `[[link]]` in both renderers. */
  linkType: "link" | "embed";
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Undirected neighbours, for hover highlighting and the local-graph walk. */
  adjacency: Map<GraphNodeId, GraphNodeId[]>;
}

/** The filter panel's settings. Persisted, so every field has to survive a JSON round trip. */
export interface GraphFilters {
  query: string;
  hideOrphans: boolean;
  colorByTag: boolean;
  /** Hops around the open note, or 0 for the whole network. */
  localDepth: number;
}

/** The interactive graph's viewport: `screen = world * k + t`. */
export interface GraphCamera {
  k: number;
  tx: number;
  ty: number;
}

/**
 * A node once d3 owns it. d3 mutates these every tick and `forceLink` rewrites the edges'
 * `source`/`target` from ids into **object references** — which makes the graph circular, so
 * neither of these types may ever be put in Redux. See `notesGraphSlice`.
 */
export interface GraphSimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Non-null once the node is pinned, i.e. dropped somewhere by a drag. */
  fx: number | null;
  fy: number | null;
  /** Fade level, eased toward 1 (visible) or 0 (filtered out) — a filter never moves a node. */
  alpha01: number;
  /** Dim level for the hover spotlight, eased toward 1 (lit) or `GRAPH_DIM_ALPHA`. */
  lit01: number;
}

export interface GraphSimEdge {
  source: GraphSimNode;
  target: GraphSimNode;
  linkType: "link" | "embed";
}
