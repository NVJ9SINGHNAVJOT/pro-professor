import { WebSocket, WebSocketServer } from "ws";
import { logger } from "@/logger/logger";
import { ClientEvent } from "@/ws/events";
import { SocketManager, socketManager } from "@/ws/managers/socketManager";
import { ClientEventPayloadMap, ExtendedWebSocket } from "@/ws/types";
import { EmitSocketEvent, SocketEmitterDependencies, SocketEventPayload } from "@/ws/emitter/emitter.type";

export class SocketEmitter {
  private wssInstance: WebSocketServer | null;
  private socketManager: SocketManager;

  constructor({ socketManager, wssInstance = null }: SocketEmitterDependencies) {
    this.socketManager = socketManager;
    this.wssInstance = wssInstance;
  }

  setWebSocketServer(wss: WebSocketServer): void {
    this.wssInstance = wss;
  }

  getWebSocketServer(): WebSocketServer | null {
    return this.wssInstance;
  }

  createSocketEvent: EmitSocketEvent = (event, data) => {
    return {
      event,
      data,
    };
  };

  emitSocketEvent<Key extends ClientEvent>(
    ws: ExtendedWebSocket | WebSocket,
    event: Key,
    data: ClientEventPayloadMap[Key],
  ): boolean {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const message: SocketEventPayload<Key> = this.createSocketEvent(event, data);

        ws.send(JSON.stringify(message));
        return true;
      } else {
        logger.warn("Attempted to send message to closed socket", {
          readyState: ws.readyState,
          userId: (ws as ExtendedWebSocket).userId,
        });
        return false;
      }
    } catch (error) {
      logger.error("Error emitting socket event", {
        error: error instanceof Error ? error.message : error,
        event,
        userId: (ws as ExtendedWebSocket).userId,
      });
      return false;
    }
  }

  emitToAll<Key extends ClientEvent>(event: Key, data: ClientEventPayloadMap[Key]): void {
    if (!this.wssInstance) {
      logger.warn("WebSocket server instance not set");
      return;
    }

    let sentCount = 0;
    this.wssInstance.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        if (this.emitSocketEvent(client, event, data)) {
          sentCount++;
        }
      }
    });

    logger.debug(`Emitted ${event} to ${sentCount} clients`);
  }

  emitToUser<Key extends ClientEvent>(userId: number, event: Key, data: ClientEventPayloadMap[Key]): void {
    if (!this.wssInstance) {
      logger.warn("WebSocket server instance not set");
      return;
    }

    const sockets = this.socketManager.getSocketsForUser(userId);

    if (sockets.length === 0) {
      logger.debug(`No active connections for user ${userId}`);
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    sockets.forEach((ws) => {
      if (this.emitSocketEvent(ws, event, data)) {
        successCount++;
      } else {
        failureCount++;
      }
    });

    logger.info(`Emitted ${event} to user ${userId}`, {
      connectionCount: sockets.length,
      successful: successCount,
      failed: failureCount,
    });
  }

  emitToUsers<Key extends ClientEvent>(userIds: number[], event: Key, data: ClientEventPayloadMap[Key]): void {
    if (userIds.length === 0) {
      logger.debug("No users specified for emitToUsers");
      return;
    }

    const uniqueUserIds = [...new Set(userIds)];

    logger.debug(`Emitting ${event} to ${uniqueUserIds.length} user(s)`);

    uniqueUserIds.forEach((userId) => {
      this.emitToUser(userId, event, data);
    });
  }

  isUserConnected(userId: number): boolean {
    const sockets = this.socketManager.getSocketsForUser(userId);
    return sockets.length > 0;
  }

  getUserConnectionCount(userId: number): number {
    const sockets = this.socketManager.getSocketsForUser(userId);
    return sockets.length;
  }
}

export const socketEmitter = new SocketEmitter({ socketManager });

export const setWebSocketServer = (wss: WebSocketServer) => socketEmitter.setWebSocketServer(wss);
