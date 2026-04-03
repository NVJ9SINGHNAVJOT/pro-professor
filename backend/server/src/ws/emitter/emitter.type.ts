import { WebSocketServer } from "ws";
import { ClientEvent } from "@/ws/events";
import { SocketManager } from "@/ws/managers/socketManager";
import { ClientEventPayloadMap, SocketEventMessage } from "@/ws/types";

export type SocketEventPayload<Key extends ClientEvent = ClientEvent> = SocketEventMessage<Key>;

export interface SocketEmitterDependencies {
  socketManager: SocketManager;
  wssInstance?: WebSocketServer | null;
}

export type EmitSocketEvent = <Key extends ClientEvent>(
  event: Key,
  data: ClientEventPayloadMap[Key],
) => SocketEventPayload<Key>;
