import { createListSlice } from "@/redux/createListSlice";
import type { NoteSummary } from "@/services/operations/notes/notes.route";

/** The note explorer's rows — seeded by `notesListLoader`, patched by every note mutation. */
const notesListSlice = createListSlice<NoteSummary>("notesList");

export const {
  setItems: setNotes,
  upsertItem: upsertNote,
  removeItem: removeNote,
} = notesListSlice.actions;
export default notesListSlice.reducer;
