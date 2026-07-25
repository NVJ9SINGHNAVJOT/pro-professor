// Central route definitions. Use these everywhere instead of hardcoding path strings.
export const ROUTES = {
  HOME: "/",
  CHAT: "/chat",
  CHAT_DETAIL: (chatId: number | string) => `/chat/${chatId}`,
  NOTES: "/notes",
  NOTES_DETAIL: (noteId: number | string) => `/notes/${noteId}`,
  DIAGRAMS: "/diagrams",
  DIAGRAMS_DETAIL: (diagramId: number | string) => `/diagrams/${diagramId}`,
  SETTINGS: "/settings",
  SETTINGS_NOTES: "/settings/notes",
  SETTINGS_STORAGE: "/settings/storage",
  ERROR: "/error",
} as const;
