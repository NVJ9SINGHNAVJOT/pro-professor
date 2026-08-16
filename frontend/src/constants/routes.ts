/**
 * The id a section's item route carries while the item is still a draft — nothing exists
 * server-side until its first save. It is deliberately a value of the **same** `:id` route rather
 * than a route of its own: the screen must not remount when the save turns `new` into a real id,
 * or an editor mid-edit would be torn down and reseeded.
 */
export const NEW_ITEM_ID = "new";

// Central route definitions. Use these everywhere instead of hardcoding path strings.
export const ROUTES = {
  HOME: "/",
  CHAT: "/chat",
  /** Unsaved new chat — no conversation row exists until its first turn. */
  CHAT_NEW: `/chat/${NEW_ITEM_ID}`,
  CHAT_DETAIL: (chatId: number | string) => `/chat/${chatId}`,
  NOTES: "/notes",
  /** Unsaved new note, always at the root — a note created inside a folder is created outright. */
  NOTES_NEW: `/notes/${NEW_ITEM_ID}`,
  NOTES_DETAIL: (noteId: number | string) => `/notes/${noteId}`,
  DIAGRAMS: "/diagrams",
  /** Unsaved new diagram, always at the root — one created inside a folder is created outright. */
  DIAGRAMS_NEW: `/diagrams/${NEW_ITEM_ID}`,
  DIAGRAMS_DETAIL: (diagramId: number | string) => `/diagrams/${diagramId}`,
  SETTINGS: "/settings",
  SETTINGS_CHAT: "/settings/chat",
  SETTINGS_NOTES: "/settings/notes",
  SETTINGS_STORAGE: "/settings/storage",
  ERROR: "/error",
} as const;
