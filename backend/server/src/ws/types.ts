import { WebSocket } from "ws";

export interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  userId?: number;
  connectedAt?: number;
  messageCount?: number;
  lastMessageTime?: number;
}

export interface WebSocketMessage {
  event?: string;
  data?: unknown;
  userId?: number;
}

export interface MessageEventData {
  text?: string;
  [key: string]: unknown;
}
