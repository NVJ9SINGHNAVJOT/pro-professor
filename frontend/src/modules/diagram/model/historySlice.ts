import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction, UnknownAction } from "@reduxjs/toolkit";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";

/**
 * Per-diagram inverse-command history. Each entry stores the slice actions
 * that redo (`redo`) and revert (`undo`) one command — commands push entries,
 * the undo/redo thunks replay them. Cleared whenever a diagram loads/closes,
 * so history is isolated per document (locked decision #3).
 */
export interface HistoryEntry {
  label: string;
  undo: UnknownAction[];
  redo: UnknownAction[];
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

const initialState: HistoryState = { past: [], future: [] };

/** A new command wipes the redo branch — standard linear history. */
const MAX_ENTRIES = 100;

const historySlice = createSlice({
  name: "diagramHistory",
  initialState,
  reducers: {
    pushed(state, action: PayloadAction<HistoryEntry>) {
      state.past.push(action.payload);
      if (state.past.length > MAX_ENTRIES) state.past.shift();
      state.future = [];
    },
    undone(state) {
      const entry = state.past.pop();
      if (entry) state.future.push(entry);
    },
    redone(state) {
      const entry = state.future.pop();
      if (entry) state.past.push(entry);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(bundleLoaded, () => initialState).addCase(diagramClosed, () => initialState);
  },
});

export const { pushed, undone, redone } = historySlice.actions;
export default historySlice.reducer;
