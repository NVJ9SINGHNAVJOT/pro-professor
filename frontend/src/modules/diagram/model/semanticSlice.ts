import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";
import type { EdgeId, NodeId, SemEdge, SemNode } from "@/modules/diagram/types";

/**
 * AI-owned meaning: nodes and edges, never coordinates. Only command thunks
 * (and bundle load) write here — a drag can never touch this slice. The
 * reducers assume the command layer already validated the change; they are
 * not exported for direct component use.
 */
export interface SemanticState {
  nodes: SemNode[];
  edges: SemEdge[];
}

const initialState: SemanticState = { nodes: [], edges: [] };

const semanticSlice = createSlice({
  name: "diagramSemantic",
  initialState,
  reducers: {
    /** `index` restores document order on undo; omitted = append. */
    nodeAdded(state, action: PayloadAction<{ node: SemNode; index?: number }>) {
      const { node, index } = action.payload;
      state.nodes.splice(index ?? state.nodes.length, 0, node);
    },
    /** Removing a node cascades to its edges (the inverse restores both). */
    nodeRemoved(state, action: PayloadAction<NodeId>) {
      state.nodes = state.nodes.filter((node) => node.id !== action.payload);
      state.edges = state.edges.filter((edge) => edge.source !== action.payload && edge.target !== action.payload);
    },
    nodeRenamed(state, action: PayloadAction<{ id: NodeId; label: string }>) {
      const node = state.nodes.find((candidate) => candidate.id === action.payload.id);
      if (node) node.label = action.payload.label;
    },
    edgeAdded(state, action: PayloadAction<{ edge: SemEdge; index?: number }>) {
      const { edge, index } = action.payload;
      state.edges.splice(index ?? state.edges.length, 0, edge);
    },
    edgeRemoved(state, action: PayloadAction<EdgeId>) {
      state.edges = state.edges.filter((edge) => edge.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bundleLoaded, (_state, action) => ({
        nodes: action.payload.bundle.semantic.nodes,
        edges: action.payload.bundle.semantic.edges,
      }))
      .addCase(diagramClosed, () => initialState);
  },
});

export const { nodeAdded, nodeRemoved, nodeRenamed, edgeAdded, edgeRemoved } = semanticSlice.actions;
export default semanticSlice.reducer;
