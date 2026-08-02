import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { GRAPH_LOCAL_DEPTH_MAX, GRAPH_MAX_ZOOM, GRAPH_MIN_ZOOM } from "@/modules/notes/constants";
import { sanitizePositions } from "@/modules/notes/utils/graph";
import type { GraphCamera, GraphFilters, GraphRenderer } from "@/modules/notes/types";
import { readJson } from "@/utils/localStore";

/**
 * The notes graph view's own state: which renderer it is showing, the interactive graph's camera,
 * where the user has dragged nodes to, and the filter panel's settings.
 *
 * It can't live in `NotesScreen` for the same reason `diagramSidebarSlice` can't live in
 * `DiagramsScreen`: `/notes` and `/notes/:noteId` are two route entries rendering two separate
 * `<NotesPage>` elements, so the first click on a graph node *remounts* the screen and would throw
 * away everything the graph was showing.
 *
 * It is also **the one slice that outlives the tab** — see `utils/localStore.ts` and the
 * subscription in `store.ts`. That makes serializability load-bearing rather than a formality:
 * pinned ids are a plain array, positions are `[x, y]` tuples, and the d3 simulation's own node
 * objects are deliberately *not* here. d3 mutates those every tick and rewrites each edge's
 * `source`/`target` from an id into an **object reference**, which makes the graph circular —
 * `JSON.stringify` throws on it. They live in a ref inside `ForceGraph`.
 *
 * `graphOpen` is deliberately *not* here either: it is a mode, and every node click is a request to
 * leave it. Persisting it would make ⌘K, a `[[link]]` from chat, and a bookmark all land on the
 * graph instead of the note that was asked for.
 */

export const GRAPH_STORAGE_KEY = "pro-professor:notes-graph:v1";
const GRAPH_STORAGE_VERSION = 1;
/** Camera changes on every wheel tick; one write per window is plenty. */
export const GRAPH_PERSIST_THROTTLE_MS = 500;

export interface NotesGraphState {
  renderer: GraphRenderer;
  /** null = no camera yet, so the graph fits itself to the pane on the next open. */
  camera: GraphCamera | null;
  positions: Record<string, [number, number]>;
  pinnedIds: string[];
  filters: GraphFilters;
  panelOpen: boolean;
}

const DEFAULT_STATE: NotesGraphState = {
  // The interactive graph is the default view of the network; the Mermaid hierarchy stays one click
  // away for reading a chain of links as a tree.
  renderer: "interactive",
  camera: null,
  positions: {},
  pinnedIds: [],
  filters: { query: "", hideOrphans: false, colorByTag: false, localDepth: 0 },
  panelOpen: false,
};

/** A camera with a NaN or out-of-range `k` makes `setTransform` paint nothing, silently — validate hard. */
const validCamera = (value: unknown): GraphCamera | null => {
  if (typeof value !== "object" || value === null) return null;
  const { k, tx, ty } = value as Partial<GraphCamera>;
  if (typeof k !== "number" || typeof tx !== "number" || typeof ty !== "number") return null;
  if (![k, tx, ty].every(Number.isFinite) || k < GRAPH_MIN_ZOOM || k > GRAPH_MAX_ZOOM) return null;
  return { k, tx, ty };
};

const validFilters = (value: unknown): GraphFilters => {
  if (typeof value !== "object" || value === null) return DEFAULT_STATE.filters;
  const saved = value as Partial<GraphFilters>;
  const depth = typeof saved.localDepth === "number" ? Math.round(saved.localDepth) : 0;
  return {
    // Never restored, even if an older blob carries one — a search is a thing you are doing now, not
    // a view preference, and one silently reappearing would hide most of the graph for no visible reason.
    query: "",
    hideOrphans: saved.hideOrphans === true,
    colorByTag: saved.colorByTag === true,
    localDepth: Math.min(GRAPH_LOCAL_DEPTH_MAX, Math.max(0, depth)),
  };
};

/**
 * Read at module-eval time, before the store exists — which keeps this out of `configureStore`'s
 * `preloadedState` and out of an import cycle with the store.
 */
const loadPersisted = (): NotesGraphState => {
  const saved = readJson<Partial<NotesGraphState> & { v?: number }>(GRAPH_STORAGE_KEY);
  if (!saved || saved.v !== GRAPH_STORAGE_VERSION) return DEFAULT_STATE;

  return {
    renderer: saved.renderer === "mermaid" ? "mermaid" : "interactive",
    camera: validCamera(saved.camera),
    positions: sanitizePositions(saved.positions),
    pinnedIds: Array.isArray(saved.pinnedIds) ? saved.pinnedIds.filter((id) => typeof id === "string") : [],
    filters: validFilters(saved.filters),
    // Always closed on open — see graphPersistPayload.
    panelOpen: false,
  };
};

const notesGraphSlice = createSlice({
  name: "notesGraph",
  initialState: loadPersisted(),
  reducers: {
    setGraphRenderer: (state, action: PayloadAction<GraphRenderer>) => {
      state.renderer = action.payload;
    },

    setGraphCamera: (state, action: PayloadAction<GraphCamera>) => {
      state.camera = action.payload;
    },

    /** The whole layout, dispatched once when the simulation settles and once on unmount. */
    saveGraphLayout: (state, action: PayloadAction<Record<string, [number, number]>>) => {
      state.positions = action.payload;
    },

    /** A drag's drop point. Dropping a node is what pins it. */
    pinGraphNode: (state, action: PayloadAction<{ id: string; x: number; y: number }>) => {
      const { id, x, y } = action.payload;
      state.positions[id] = [x, y];
      if (!state.pinnedIds.includes(id)) state.pinnedIds.push(id);
    },

    unpinGraphNode: (state, action: PayloadAction<string>) => {
      state.pinnedIds = state.pinnedIds.filter((id) => id !== action.payload);
    },

    unpinAllGraphNodes: (state) => {
      state.pinnedIds = [];
    },

    /**
     * Drops positions for nodes that no longer exist, so a long-lived vault doesn't accumulate a
     * position for every note ever deleted. Returns the state untouched when there is nothing to
     * drop — this runs after every model build, and a new object each time would loop into a write.
     */
    pruneGraphPositions: (state, action: PayloadAction<string[]>) => {
      const known = new Set(action.payload);
      const stale = Object.keys(state.positions).filter((id) => !known.has(id));
      if (stale.length === 0) return;
      for (const id of stale) delete state.positions[id];
      state.pinnedIds = state.pinnedIds.filter((id) => known.has(id));
    },

    setGraphQuery: (state, action: PayloadAction<string>) => {
      state.filters.query = action.payload;
    },

    toggleGraphOrphans: (state) => {
      state.filters.hideOrphans = !state.filters.hideOrphans;
    },

    toggleGraphTagColors: (state) => {
      state.filters.colorByTag = !state.filters.colorByTag;
    },

    setGraphLocalDepth: (state, action: PayloadAction<number>) => {
      state.filters.localDepth = Math.min(GRAPH_LOCAL_DEPTH_MAX, Math.max(0, Math.round(action.payload)));
    },

    toggleGraphPanel: (state) => {
      state.panelOpen = !state.panelOpen;
    },

    openGraphPanel: (state) => {
      state.panelOpen = true;
    },

    /** Back to a blank slate: refit the camera, unpin everything, clear the filters. */
    resetGraphView: (state) => {
      state.camera = null;
      state.positions = {};
      state.pinnedIds = [];
      state.filters = DEFAULT_STATE.filters;
    },
  },
});

export const {
  setGraphRenderer,
  setGraphCamera,
  saveGraphLayout,
  pinGraphNode,
  unpinGraphNode,
  unpinAllGraphNodes,
  pruneGraphPositions,
  setGraphQuery,
  toggleGraphOrphans,
  toggleGraphTagColors,
  setGraphLocalDepth,
  toggleGraphPanel,
  openGraphPanel,
  resetGraphView,
} = notesGraphSlice.actions;

/**
 * What goes to localStorage: the arranging work, not the transient controls.
 *
 * `panelOpen` and `filters.query` are deliberately left out. Both are things you are *doing* rather
 * than how you like the view set up — a filter panel that reopens itself every session is noise,
 * and a search string coming back would quietly hide most of the graph.
 */
export const graphPersistPayload = (state: NotesGraphState) => ({
  v: GRAPH_STORAGE_VERSION,
  renderer: state.renderer,
  camera: state.camera,
  positions: state.positions,
  pinnedIds: state.pinnedIds,
  filters: {
    hideOrphans: state.filters.hideOrphans,
    colorByTag: state.filters.colorByTag,
    localDepth: state.filters.localDepth,
  },
});

export default notesGraphSlice.reducer;
