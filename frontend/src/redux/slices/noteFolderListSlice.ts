import { createListSlice } from "@/redux/createListSlice";
import type { NoteFolderSummary } from "@/services/operations/notes/notes.route";

/**
 * The note explorer's folders — seeded by `notesListLoader` alongside the notes themselves, then
 * patched per row by create/rename/move.
 *
 * A second list beside `notesList` rather than one slice holding both: the note rows keep the
 * upsert-to-front behavior the editor's save relies on, untouched.
 */
const noteFolderListSlice = createListSlice<NoteFolderSummary>("noteFolderList");

export const {
  setItems: setNoteFolders,
  upsertItem: upsertNoteFolder,
  removeItem: removeNoteFolder,
} = noteFolderListSlice.actions;
export default noteFolderListSlice.reducer;
