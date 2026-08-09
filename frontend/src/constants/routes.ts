/**
 * The id a section's item route carries while the item is still a draft — nothing exists
 * server-side until its first save. It is deliberately a value of the **same** `:id` route rather
 * than a route of its own: the screen must not remount when the save turns `new` into a real id,
 * or an editor mid-edit would be torn down and reseeded.
 */
export const NEW_ITEM_ID = "new";

/**
 * The search param a draft carries when it was started from inside a folder.
 *
 * It has to live in the URL rather than in screen state: `/notes` and `/notes/:noteId` are separate
 * route entries, so opening the draft **remounts** the screen and anything held in a ref or
 * `useState` is gone before the first save reads it — which silently filed every note created from
 * a folder's menu at the root instead. Deliberately not `folder`, which the explorer already uses
 * for the folder it is browsing.
 */
export const DRAFT_FOLDER_PARAM = "in";

/** `/…/new`, optionally carrying the folder the draft should be filed in once it is saved. */
const newItemPath = (section: string, folderId: number | null) =>
  folderId === null ? `${section}/${NEW_ITEM_ID}` : `${section}/${NEW_ITEM_ID}?${DRAFT_FOLDER_PARAM}=${folderId}`;

// Central route definitions. Use these everywhere instead of hardcoding path strings.
export const ROUTES = {
  HOME: "/",
  CHAT: "/chat",
  /** Unsaved new chat — no conversation row exists until its first turn. */
  CHAT_NEW: `/chat/${NEW_ITEM_ID}`,
  CHAT_DETAIL: (chatId: number | string) => `/chat/${chatId}`,
  NOTES: "/notes",
  /** Unsaved new note — no note row exists until its first save. */
  NOTES_NEW: `/notes/${NEW_ITEM_ID}`,
  /** The same draft, remembering the folder it should land in — see `DRAFT_FOLDER_PARAM`. */
  NOTES_NEW_IN: (folderId: number | null) => newItemPath("/notes", folderId),
  NOTES_DETAIL: (noteId: number | string) => `/notes/${noteId}`,
  DIAGRAMS: "/diagrams",
  /** Unsaved new diagram — no diagram row exists until its first autosave. */
  DIAGRAMS_NEW: `/diagrams/${NEW_ITEM_ID}`,
  /** The same draft, remembering the folder it should land in — see `DRAFT_FOLDER_PARAM`. */
  DIAGRAMS_NEW_IN: (folderId: number | null) => newItemPath("/diagrams", folderId),
  DIAGRAMS_DETAIL: (diagramId: number | string) => `/diagrams/${diagramId}`,
  SETTINGS: "/settings",
  SETTINGS_NOTES: "/settings/notes",
  SETTINGS_STORAGE: "/settings/storage",
  ERROR: "/error",
} as const;
