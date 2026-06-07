import { clientE } from "@/socket/events";
import type { ModelProvider } from "@/services/operations/models.route";

/* INFO: These payloads must match the backend WS event records. */

// ===== client -> server =====
export interface ChatSendPayload {
  conversationId: number | null;
  provider?: ModelProvider;
  model?: string;
  content: string;
}

// ===== server -> client payloads =====
export interface ChatStartPayload {
  conversationId: number;
  title: string;
}

export interface ChatChunkPayload {
  conversationId: number;
  delta: string;
}

export interface ChatDonePayload {
  conversationId: number;
  messageId: number;
}

export interface ChatErrorPayload {
  message: string;
}

// Map each server event type to its payload, so subscribe() can infer the payload type.
export interface ServerEventMap {
  [clientE.CHAT_START]: ChatStartPayload;
  [clientE.CHAT_CHUNK]: ChatChunkPayload;
  [clientE.CHAT_DONE]: ChatDonePayload;
  [clientE.CHAT_ERROR]: ChatErrorPayload;
}

export type ServerEventType = keyof ServerEventMap;

// Discriminated union of everything the server can send (each frame has a `type`).
export type ServerEvent =
  | ({ type: typeof clientE.CHAT_START } & ChatStartPayload)
  | ({ type: typeof clientE.CHAT_CHUNK } & ChatChunkPayload)
  | ({ type: typeof clientE.CHAT_DONE } & ChatDonePayload)
  | ({ type: typeof clientE.CHAT_ERROR } & ChatErrorPayload);
