import {
  DIAGRAM_SUFFIX,
  GRAPH_FIT_MAX_ZOOM,
  GRAPH_FIT_PADDING,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  GRAPH_NODE_MAX_RADIUS,
  GRAPH_NODE_MIN_RADIUS,
  GRAPH_TAG_COLORS,
} from "@/modules/notes/constants";
import type { GraphCamera, GraphEdge, GraphFilters, GraphModel, GraphNode, GraphNodeId } from "@/modules/notes/types";
import type { NoteLink, NoteSummary } from "@/services/operations/notes/notes.route";

/**
 * The note network as data, shared by both graph renderers so they can never disagree about what
 * the network *is* — Mermaid serializes this to a `graph TD` definition, the interactive canvas
 * hands it to d3. Pure and DOM-free: this file is the unit-tested half of the graph view.
 */

/** Node ids are namespaced by kind — see `GraphNodeId`. Notes key on the id, so a rename can't move a node. */
export const noteNodeId = (noteId: number): GraphNodeId => `note:${noteId}`;
export const refNodeId = (targetRef: string): GraphNodeId => `ref:${targetRef.trim().toLowerCase()}`;

/**
 * Builds the shared model from the explorer list and `GET /notes/links`.
 *
 * Link targets are matched to notes by **title**, case-insensitively — that is how the backend's
 * LinkParser writes them and there is no id on the wire. A target nothing resolves to becomes its
 * own placeholder node, which is what makes an unwritten `[[idea]]` visible in the graph.
 */
export function buildGraphModel(notes: NoteSummary[], links: NoteLink[]): GraphModel {
  const nodes: GraphNode[] = [];
  const byId = new Map<GraphNodeId, GraphNode>();
  const byTitle = new Map<string, GraphNode>();

  const add = (node: GraphNode) => {
    nodes.push(node);
    byId.set(node.id, node);
    return node;
  };

  for (const note of notes) {
    const node = add({ id: noteNodeId(note.id), noteId: note.id, title: note.title, tags: note.tags, degree: 0 });
    // Titles are unique server-side; on the off chance of a clash the first one wins, matching
    // how `useWikiHandlers` resolves a link with `find`.
    const key = note.title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, node);
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const adjacency = new Map<GraphNodeId, GraphNodeId[]>();
  const neighboursOf = (id: GraphNodeId) => {
    let list = adjacency.get(id);
    if (!list) {
      list = [];
      adjacency.set(id, list);
    }
    return list;
  };
  const connect = (a: GraphNodeId, b: GraphNodeId) => {
    neighboursOf(a).push(b);
    neighboursOf(b).push(a);
  };

  for (const link of links) {
    const target = link.targetRef.trim();
    // `[[Title.diagram]]` points at a standalone diagram, not a note — it belongs on the diagrams
    // page, not in the note network, and showing it as an unwritten note is a lie.
    if (!target || target.toLowerCase().endsWith(DIAGRAM_SUFFIX)) continue;

    const source = byId.get(noteNodeId(link.sourceNoteId));
    if (!source) continue; // a link from a note the explorer doesn't have — nothing to draw it from

    const resolved = byTitle.get(target.toLowerCase());
    const targetNode =
      resolved ??
      byId.get(refNodeId(target)) ??
      add({ id: refNodeId(target), noteId: null, title: target, tags: [], degree: 0 });

    if (targetNode.id === source.id) continue; // a note linking to itself draws a dot on itself

    // The same pair can be linked from several places in one note, and by both a `[[link]]` and an
    // `![[embed]]`; that is one connection, not five. Deduping on the pair keeps `degree` honest —
    // it is what sizes the node and what decides whether it counts as an orphan.
    const key = `${source.id} ${targetNode.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    edges.push({ source: source.id, target: targetNode.id, linkType: link.linkType });
    source.degree += 1;
    targetNode.degree += 1;
    connect(source.id, targetNode.id);
  }

  return { nodes, edges, adjacency };
}

/**
 * A cheap content fingerprint. `notes` is Redux state, so saving *any* note hands down a new array
 * identity — rebuilding the model on that would reset the layout the user just arranged. Keying the
 * sync effect on this instead means only a real change (a note added, renamed, deleted, a link
 * written) touches the simulation.
 */
export function graphSignature(notes: NoteSummary[], links: NoteLink[]): string {
  const notePart = notes.map((note) => `${note.id}:${note.title}:${note.tags.join(",")}`).join("|");
  const linkPart = links.map((link) => `${link.sourceNoteId}>${link.targetRef}:${link.linkType}`).join("|");
  return `${notePart} ${linkPart}`;
}

/** Node ids within `depth` undirected hops of `rootId`, inclusive. Empty when the root isn't in the graph. */
export function localGraphIds(
  adjacency: Map<GraphNodeId, GraphNodeId[]>,
  rootId: GraphNodeId | null,
  depth: number,
  known: Set<GraphNodeId>,
): Set<GraphNodeId> {
  const reached = new Set<GraphNodeId>();
  if (rootId === null || depth <= 0 || !known.has(rootId)) return reached;

  reached.add(rootId);
  let frontier = [rootId];
  for (let hop = 0; hop < depth; hop++) {
    const next: GraphNodeId[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (reached.has(neighbour)) continue;
        reached.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return reached;
}

/**
 * Which nodes the filters leave showing. This is a *mask*, never a re-layout: the simulation always
 * holds the whole graph, so typing in the search box fades nodes out rather than sliding the ones
 * you're looking for out from under the cursor.
 */
export function visibleNodeIds(model: GraphModel, filters: GraphFilters, rootId: GraphNodeId | null): Set<GraphNodeId> {
  const known = new Set(model.nodes.map((node) => node.id));
  // With no note open there is no root to walk from, so the depth filter is inert rather than
  // total — `/notes` would otherwise show an empty canvas with no way to tell why.
  const local =
    filters.localDepth > 0 && rootId !== null
      ? localGraphIds(model.adjacency, rootId, filters.localDepth, known)
      : null;
  const query = filters.query.trim().toLowerCase();

  const visible = new Set<GraphNodeId>();
  for (const node of model.nodes) {
    if (local !== null && !local.has(node.id)) continue;
    if (filters.hideOrphans && node.degree === 0) continue;
    if (query && !node.title.toLowerCase().includes(query)) continue;
    visible.add(node.id);
  }
  return visible;
}

/** Bigger for a better-connected note, so hubs read at a glance. Flattened by sqrt — degree is long-tailed. */
export function nodeRadius(degree: number): number {
  return Math.min(GRAPH_NODE_MAX_RADIUS, GRAPH_NODE_MIN_RADIUS + Math.sqrt(degree) * 2.2);
}

/** FNV-1a, so a tag keeps its colour across sessions without anything being stored. */
export function tagColor(tag: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < tag.length; i++) {
    hash ^= tag.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return GRAPH_TAG_COLORS[Math.abs(hash) % GRAPH_TAG_COLORS.length];
}

/* ── Camera ─────────────────────────────────────────────────────────────────────────────────── */

export const IDENTITY_CAMERA: GraphCamera = { k: 1, tx: 0, ty: 0 };

export const clampZoom = (k: number) => Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, k));

export const toWorld = (camera: GraphCamera, screenX: number, screenY: number) => ({
  x: (screenX - camera.tx) / camera.k,
  y: (screenY - camera.ty) / camera.k,
});

/**
 * Zoom about a screen point: whatever is under the cursor stays under it. Solving
 * `sx = x*k + tx` for the same world `x` at the new scale gives `tx' = sx - (sx - tx) * k'/k`.
 */
export function zoomAbout(camera: GraphCamera, screenX: number, screenY: number, factor: number): GraphCamera {
  const k = clampZoom(camera.k * factor);
  const ratio = k / camera.k;
  return { k, tx: screenX - (screenX - camera.tx) * ratio, ty: screenY - (screenY - camera.ty) * ratio };
}

/** The camera that frames `points` in a `width × height` viewport. Identity when there is nothing to frame. */
export function fitCamera(points: { x: number; y: number }[], width: number, height: number): GraphCamera {
  if (points.length === 0 || width <= 0 || height <= 0) return IDENTITY_CAMERA;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  const usableWidth = Math.max(1, width - GRAPH_FIT_PADDING * 2);
  const usableHeight = Math.max(1, height - GRAPH_FIT_PADDING * 2);
  // A single node — or a perfectly flat row — has zero extent in one axis; that axis must not decide the zoom.
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const k = clampZoom(
    Math.min(
      spanX > 0 ? usableWidth / spanX : GRAPH_FIT_MAX_ZOOM,
      spanY > 0 ? usableHeight / spanY : GRAPH_FIT_MAX_ZOOM,
      GRAPH_FIT_MAX_ZOOM,
    ),
  );

  return { k, tx: width / 2 - ((minX + maxX) / 2) * k, ty: height / 2 - ((minY + maxY) / 2) * k };
}

/** Drops anything a hand-edited or half-written localStorage blob could put in the positions map. */
export function sanitizePositions(value: unknown): Record<string, [number, number]> {
  if (typeof value !== "object" || value === null) return {};
  const clean: Record<string, [number, number]> = {};
  for (const [id, position] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(position) || position.length !== 2) continue;
    const [x, y] = position;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    clean[id] = [x, y];
  }
  return clean;
}
