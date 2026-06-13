import { wsEvents } from "@/socket/events";

/* INFO: These payloads must match the backend WS event records
 *       (OutgoingEvent.NotificationInfo). */

// ===== server → client payloads =====

/** Type-safe notification payload matching backend NotificationInfo record. */
export interface NotificationInfoPayload {
  name: string;
  description: string;
}

// Map each server event type to its payload, so subscribe() can infer the payload type.
export interface ServerEventMap {
  [wsEvents.NOTIFICATION_INFO]: NotificationInfoPayload;
}

export type ServerEventType = keyof ServerEventMap;

// Discriminated union of everything the server can send (each frame has a `type`).
export type ServerEvent = { type: typeof wsEvents.NOTIFICATION_INFO } & NotificationInfoPayload;
