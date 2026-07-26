import { createListSlice } from "@/redux/createListSlice";
import type { DiagramSummary } from "@/services/operations/diagrams/diagrams.route";

/** The diagram list's rows — seeded by `diagramsListLoader`, patched by every autosave. */
const diagramListSlice = createListSlice<DiagramSummary>("diagramList");

export const {
  setItems: setDiagrams,
  upsertItem: upsertDiagram,
  removeItem: removeDiagram,
} = diagramListSlice.actions;
export default diagramListSlice.reducer;
