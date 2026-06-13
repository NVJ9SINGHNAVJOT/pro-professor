/* INFO: Any change to these event names must be mirrored in the Spring backend
 *       (backend/central-server/.../websocket/events/WsEvents.java). Keep both in sync. */

// events the client listens for (server → client)
export const wsEvents = {
  NOTIFICATION_INFO: "notification.info",
} as const;
