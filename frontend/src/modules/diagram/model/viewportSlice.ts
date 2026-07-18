import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";

/** Zoom/pan — ephemeral view state, never persisted into the bundle. */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

const initialState: ViewportState = { x: 0, y: 0, zoom: 1 };

const viewportSlice = createSlice({
  name: "diagramViewport",
  initialState,
  reducers: {
    setViewport(_state, action: PayloadAction<ViewportState>) {
      return action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(bundleLoaded, () => initialState).addCase(diagramClosed, () => initialState);
  },
});

export const { setViewport } = viewportSlice.actions;
export default viewportSlice.reducer;
