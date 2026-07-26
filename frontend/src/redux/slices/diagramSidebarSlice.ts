import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Which folders and sections the diagram sidebar has open.
 *
 * This is UI state, but it can't live in `DiagramsScreen`: `/diagrams` and `/diagrams/:diagramId`
 * are two route entries rendering two separate `<DiagramsPage>` elements, so the first click on a
 * diagram *remounts* the screen and would reset everything the sidebar was showing — the folder you
 * just opened would snap shut under you.
 *
 * Ids are a plain array, not a Set, because Redux state has to stay serializable.
 */
const diagramSidebarSlice = createSlice({
  name: "diagramSidebar",
  initialState: {
    expandedFolderIds: [] as number[],
    showDiagrams: true,
    showFolders: true,
  },
  reducers: {
    toggleFolderExpanded: (state, action: PayloadAction<number>) => {
      const id = action.payload;
      state.expandedFolderIds = state.expandedFolderIds.includes(id)
        ? state.expandedFolderIds.filter((current) => current !== id)
        : [...state.expandedFolderIds, id];
    },

    /** Used when a drop lands in a collapsed folder — the row would otherwise vanish into it. */
    expandFolder: (state, action: PayloadAction<number>) => {
      if (!state.expandedFolderIds.includes(action.payload)) state.expandedFolderIds.push(action.payload);
    },

    /**
     * Opens a whole ancestor chain at once, so entering the section on `/diagrams/:id` — a reload,
     * or a `[[Title.diagram]]` link — shows the open diagram in its folder rather than hiding it
     * inside collapsed parents.
     */
    revealFolders: (state, action: PayloadAction<number[]>) => {
      const missing = action.payload.filter((id) => !state.expandedFolderIds.includes(id));
      state.expandedFolderIds.push(...missing);
    },

    /** Deleting a folder cascades; drop the ids so they can't resurrect on a later create. */
    forgetFolders: (state, action: PayloadAction<number[]>) => {
      state.expandedFolderIds = state.expandedFolderIds.filter((id) => !action.payload.includes(id));
    },

    toggleDiagramsSection: (state) => {
      state.showDiagrams = !state.showDiagrams;
    },

    toggleFoldersSection: (state) => {
      state.showFolders = !state.showFolders;
    },
  },
});

export const {
  toggleFolderExpanded,
  expandFolder,
  revealFolders,
  forgetFolders,
  toggleDiagramsSection,
  toggleFoldersSection,
} = diagramSidebarSlice.actions;
export default diagramSidebarSlice.reducer;
