// Central route definitions. Use these everywhere instead of hardcoding path strings.
export const ROUTES = {
  HOME: "/",
  CHAT: "/chat",
  CHAT_DETAIL: (chatId: number | string) => `/chat/${chatId}`,
  SETTINGS: "/settings",
  DASHBOARD: "/dashboard",
  ERROR: "/error",
} as const;
