import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";
import type { LayoutEntry, NodeId } from "@/modules/diagram/types";

/**
 * User-owned arrangement, keyed by node id. Written only by drag/resize commits
 * and incremental placement of new nodes — an AI edit never rewrites an
 * existing entry.
 */
export type LayoutState = Record<NodeId, LayoutEntry>;

const initialState: LayoutState = {};

const layoutSlice = createSlice({
  name: "diagramLayout",
  initialState,
  reducers: {
    /** Drag-end commit. A first move of a grid-placed node creates its entry (w/h 0 = size auto). */
    moveNode(state, action: PayloadAction<{ id: NodeId; x: number; y: number }>) {
      const { id, x, y } = action.payload;
      const entry = state[id];
      if (entry) {
        entry.x = x;
        entry.y = y;
      } else {
        state[id] = { x, y, w: 0, h: 0 };
      }
    },
    /** Resize-end commit (NodeResizer, when a node type opts in). */
    resizeNode(state, action: PayloadAction<{ id: NodeId; w: number; h: number }>) {
      const { id, w, h } = action.payload;
      const entry = state[id];
      if (entry) {
        entry.w = w;
        entry.h = h;
      }
    },
    /** Whole-entry set — used by undo restore and incremental placement of new nodes. */
    entrySet(state, action: PayloadAction<{ id: NodeId; entry: LayoutEntry }>) {
      state[action.payload.id] = action.payload.entry;
    },
    entryRemoved(state, action: PayloadAction<NodeId>) {
      delete state[action.payload];
    },
    /** Whole-map restore — undo of a delete brings back exact key order too. */
    layoutReplaced(_state, action: PayloadAction<LayoutState>) {
      return action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bundleLoaded, (_state, action) => action.payload.bundle.layout)
      .addCase(diagramClosed, () => initialState);
  },
});

export const { moveNode, resizeNode, entrySet, entryRemoved, layoutReplaced } = layoutSlice.actions;
export default layoutSlice.reducer;
