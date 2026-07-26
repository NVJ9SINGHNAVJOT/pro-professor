import { createListSlice } from "@/redux/createListSlice";
import type { DiagramFolderSummary } from "@/services/operations/diagrams/diagrams.route";

/**
 * The diagram sidebar's folders — seeded by `diagramsListLoader` alongside the diagrams themselves,
 * then patched per row by create/rename/move.
 *
 * A second list beside `diagramList` rather than one slice holding both: the diagram rows keep the
 * upsert-to-front behavior the editor's autosave relies on, untouched.
 */
const diagramFolderListSlice = createListSlice<DiagramFolderSummary>("diagramFolderList");

export const {
  setItems: setDiagramFolders,
  upsertItem: upsertDiagramFolder,
  removeItem: removeDiagramFolder,
} = diagramFolderListSlice.actions;
export default diagramFolderListSlice.reducer;
