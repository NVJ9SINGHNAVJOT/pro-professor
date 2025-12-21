import { WebSocketServer, WebSocket } from "ws";
import { ExtendedWebSocket } from "@/ws/types";
import { ClientEvent } from "@/ws/events";
import { SocketManager, socketManager } from "@/ws/getSocketIds";
import { logger } from "@/logger/logger";

/**
 * Handles emitting events to WebSocket clients
 */
export class SocketEmitter {
  private wssInstance: WebSocketServer | null = null;

  constructor(private socketManager: SocketManager) {}

  setWebSocketServer(wss: WebSocketServer): void {
    this.wssInstance = wss;
  }

  getWebSocketServer(): WebSocketServer | null {
    return this.wssInstance;
  }

  emitSocketEvent(ws: ExtendedWebSocket | WebSocket, event: ClientEvent, data: unknown): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          event,
          data,
        });
        ws.send(message);
      } else {
        logger.warn("Attempted to send message to closed socket", {
          readyState: ws.readyState,
          userId: (ws as ExtendedWebSocket).userId,
        });
      }
    } catch (error) {
      logger.error("Error emitting socket event", {
        error: error instanceof Error ? error.message : error,
        event,
        userId: (ws as ExtendedWebSocket).userId,
      });
    }
  }

  emitToAll(event: ClientEvent, data: unknown): void {
    if (!this.wssInstance) {
      logger.warn("WebSocket server instance not set");
      return;
    }

    let sentCount = 0;
    this.wssInstance.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        this.emitSocketEvent(client, event, data);
        sentCount++;
      }
    });

    logger.debug(`Emitted ${event} to ${sentCount} clients`);
  }

  /**
   * Emits event to all active connections of a user (supports multiple devices/browsers)
   */
  emitToUser(userId: number, event: ClientEvent, data: unknown): void {
    if (!this.wssInstance) {
      logger.warn("WebSocket server instance not set");
      return;
    }

    const sockets = this.socketManager.getSocketIds(userId);

    if (sockets.length === 0) {
      logger.debug(`No active connections for user ${userId}`);
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    sockets.forEach((ws) => {
      try {
        this.emitSocketEvent(ws, event, data);
        successCount++;
      } catch (error) {
        failureCount++;
        logger.error("Failed to emit to user connection", {
          userId,
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    logger.info(`Emitted ${event} to user ${userId}`, {
      connectionCount: sockets.length,
      successful: successCount,
      failed: failureCount,
    });
  }

  emitToUsers(userIds: number[], event: ClientEvent, data: unknown): void {
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
    const sockets = this.socketManager.getSocketIds(userId);
    return sockets.length > 0;
  }

  getUserConnectionCount(userId: number): number {
    const sockets = this.socketManager.getSocketIds(userId);
    return sockets.length;
  }
}

export const socketEmitter = new SocketEmitter(socketManager);

export const setWebSocketServer = (wss: WebSocketServer) => socketEmitter.setWebSocketServer(wss);
