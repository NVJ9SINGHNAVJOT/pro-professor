// Server events (events that the server listens for from clients)
export const SERVER_EVENTS = {
  TEST_NOTIFICATION: "test-notification",
} as const;

// Client events (events that the server emits to clients)
export const CLIENT_EVENTS = {
  NOTIFICATION: "notification",
  ERROR: "error",
} as const;

export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
