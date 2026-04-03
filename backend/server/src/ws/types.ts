import { WebSocket } from "ws";
import { CLIENT_EVENTS, ClientEvent, SERVER_EVENTS, ServerEvent } from "@/ws/events";

export interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  userId?: number;
  connectedAt?: number;
  messageCount?: number;
  lastMessageTime?: number;
}

export interface NotificationEventData {
  title: string;
  message: string;
}

export interface TestNotificationEventData {
  message: string;
}

export interface ErrorEventData {
  message: string;
}

export interface ServerEventPayloadMap {
  [SERVER_EVENTS.TEST_NOTIFICATION]: TestNotificationEventData;
}

export interface ClientEventPayloadMap {
  [CLIENT_EVENTS.NOTIFICATION]: NotificationEventData;
  [CLIENT_EVENTS.ERROR]: ErrorEventData;
}

export type WebSocketMessage = {
  [Key in ServerEvent]: {
    event: Key;
    data: ServerEventPayloadMap[Key];
  };
}[ServerEvent];

export type SocketEventMessage<Key extends ClientEvent = ClientEvent> = {
  event: Key;
  data: ClientEventPayloadMap[Key];
};
