import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Which folders, tags and sections the note explorer has open.
 *
 * This is UI state, but it can't live in `NoteList`: `/notes` and `/notes/:noteId` are two route
 * entries rendering two separate `<NotesPage>` elements, so the first click on a note *remounts*
 * the screen and would reset everything the explorer was showing — the folder you just opened
 * would snap shut under you.
 *
 * Ids are a plain array, not a Set, because Redux state has to stay serializable.
 */
const notesSidebarSlice = createSlice({
  name: "notesSidebar",
  initialState: {
    expandedFolderIds: [] as number[],
    expandedTags: [] as string[],
    showTags: true,
    showNotes: true,
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
     * Opens a whole ancestor chain at once, so entering the section on `/notes/:id` — a reload, or
     * a `[[wiki link]]` — shows the open note in its folder rather than hiding it inside collapsed
     * parents.
     */
    revealFolders: (state, action: PayloadAction<number[]>) => {
      const missing = action.payload.filter((id) => !state.expandedFolderIds.includes(id));
      state.expandedFolderIds.push(...missing);
    },

    /** Deleting a folder cascades; drop the ids so they can't resurrect on a later create. */
    forgetFolders: (state, action: PayloadAction<number[]>) => {
      state.expandedFolderIds = state.expandedFolderIds.filter((id) => !action.payload.includes(id));
    },

    toggleTagExpanded: (state, action: PayloadAction<string>) => {
      const tag = action.payload;
      state.expandedTags = state.expandedTags.includes(tag)
        ? state.expandedTags.filter((current) => current !== tag)
        : [...state.expandedTags, tag];
    },

    toggleTagsSection: (state) => {
      state.showTags = !state.showTags;
    },

    toggleNotesSection: (state) => {
      state.showNotes = !state.showNotes;
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
  toggleTagExpanded,
  toggleTagsSection,
  toggleNotesSection,
  toggleFoldersSection,
} = notesSidebarSlice.actions;
export default notesSidebarSlice.reducer;
