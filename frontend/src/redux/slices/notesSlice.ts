import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface NoteListItem {
  id: number;
  title: string;
  tags: string[];
  updatedAt: string;
}

interface NotesState {
  notesLoading: boolean;
  notes: NoteListItem[];
}

const initialState: NotesState = {
  notesLoading: false,
  notes: [],
};

const notesSlice = createSlice({
  name: "notes",
  initialState: initialState,
  reducers: {
    setNotesLoading(state, action: PayloadAction<boolean>) {
      state.notesLoading = action.payload;
    },
    setNotes(state, action: PayloadAction<NoteListItem[]>) {
      state.notes = action.payload;
    },
    upsertNote(state, action: PayloadAction<NoteListItem>) {
      // de-dupe, then put the freshest edit on top (list is ordered by updatedAt)
      state.notes = [action.payload, ...state.notes.filter((note) => note.id !== action.payload.id)];
    },
    removeNote(state, action: PayloadAction<number>) {
      state.notes = state.notes.filter((note) => note.id !== action.payload);
    },
  },
});

export const { setNotesLoading, setNotes, upsertNote, removeNote } = notesSlice.actions;
export default notesSlice.reducer;
