import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/redux/rootReducer";
import type { DiagramBundle } from "@/modules/diagram/types";

export const selectDiagramDoc = (state: RootState) => state.diagram.doc;
export const selectSemantic = (state: RootState) => state.diagram.semantic;
export const selectLayout = (state: RootState) => state.diagram.layout;
export const selectViewport = (state: RootState) => state.diagram.viewport;
export const selectSelection = (state: RootState) => state.diagram.selection;

/** Reassembles the persistable bundle from the store — the inverse of bundleLoaded. */
export const selectBundle = createSelector([selectDiagramDoc, selectSemantic, selectLayout], (doc, semantic, layout): DiagramBundle => ({
  schemaVersion: doc.schemaVersion,
  semantic: { nodes: semantic.nodes, edges: semantic.edges },
  layout,
  theme: doc.theme,
  metadata: doc.metadata,
}));
