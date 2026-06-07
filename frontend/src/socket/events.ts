/* INFO: Any change to these event names must be mirrored in the Spring backend
 *       (backend/central-server/.../websocket/events/ChatEvents.java). Keep both in sync. */

// events the server listens for (client -> server)
export const serverE = {
  CHAT_SEND: "chat.send",
} as const;

// events the client listens for (server -> client)
export const clientE = {
  CHAT_START: "chat.start",
  CHAT_CHUNK: "chat.chunk",
  CHAT_DONE: "chat.done",
  CHAT_ERROR: "chat.error",
} as const;
