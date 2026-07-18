import { createSlice } from "@reduxjs/toolkit";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";
import { DIAGRAM_SCHEMA_VERSION, type DiagramMetadata } from "@/modules/diagram/types";

/**
 * Document bookkeeping (not a content namespace): which diagram is open, plus
 * the bundle fields that round-trip through save unchanged (theme, metadata).
 */
export interface DocState {
  /** Persisted diagram id, or null when nothing (or an unsaved diagram) is open. */
  id: number | null;
  title: string;
  loaded: boolean;
  schemaVersion: string;
  theme: string;
  metadata: DiagramMetadata;
}

const emptyMetadata: DiagramMetadata = { created: "", updated: "", rendererVersion: "" };

const initialState: DocState = {
  id: null,
  title: "",
  loaded: false,
  schemaVersion: DIAGRAM_SCHEMA_VERSION,
  theme: "default-dark",
  metadata: emptyMetadata,
};

const docSlice = createSlice({
  name: "diagramDoc",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(bundleLoaded, (_state, action) => ({
        id: action.payload.id,
        title: action.payload.title,
        loaded: true,
        schemaVersion: action.payload.bundle.schemaVersion,
        theme: action.payload.bundle.theme,
        metadata: action.payload.bundle.metadata,
      }))
      .addCase(diagramClosed, () => initialState);
  },
});

export default docSlice.reducer;
