import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";
import type { EdgeId, NodeId } from "@/modules/diagram/types";

/** Selected ids — pure interaction state, never persisted. */
export interface SelectionState {
  nodeIds: NodeId[];
  edgeIds: EdgeId[];
}

const initialState: SelectionState = { nodeIds: [], edgeIds: [] };

const selectionSlice = createSlice({
  name: "diagramSelection",
  initialState,
  reducers: {
    setSelection(_state, action: PayloadAction<SelectionState>) {
      return action.payload;
    },
    /** One React Flow select change — add or drop a single node id. */
    nodeSelectionChanged(state, action: PayloadAction<{ id: NodeId; selected: boolean }>) {
      const { id, selected } = action.payload;
      const has = state.nodeIds.includes(id);
      if (selected && !has) state.nodeIds.push(id);
      if (!selected && has) state.nodeIds = state.nodeIds.filter((nodeId) => nodeId !== id);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(bundleLoaded, () => initialState).addCase(diagramClosed, () => initialState);
  },
});

export const { setSelection, nodeSelectionChanged } = selectionSlice.actions;
export default selectionSlice.reducer;
