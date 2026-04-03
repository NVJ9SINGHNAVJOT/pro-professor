import { logger } from "@/logger/logger";
import { SocketManager, socketManager } from "@/ws/managers/socketManager";
import { ExtendedWebSocket } from "@/ws/types";

export class OnlineStatusManager {
  constructor(private socketManager: SocketManager) {}

  setUserOnline(userId: number, ws: ExtendedWebSocket): void {
    this.socketManager.addSocketForUser(userId, ws);
    logger.info(`User ${userId} is now online`);
  }

  setUserOffline(ws: ExtendedWebSocket): void {
    const userId = this.socketManager.getUserIdForSocket(ws);
    if (userId !== undefined) {
      this.socketManager.removeSocketForUser(ws);
      const remainingSockets = this.socketManager.getSocketsForUser(userId);

      if (remainingSockets.length === 0) {
        logger.info(`User ${userId} is now offline`);
      } else {
        logger.info(`User ${userId} has ${remainingSockets.length} remaining connection(s)`);
      }
    }
  }

  isUserOnline(userId: number): boolean {
    return this.socketManager.getSocketsForUser(userId).length > 0;
  }

  getUserOnlineStatus(userId: number): {
    isOnline: boolean;
    connectionCount: number;
  } {
    const sockets = this.socketManager.getSocketsForUser(userId);
    return {
      isOnline: sockets.length > 0,
      connectionCount: sockets.length,
    };
  }
}

export const onlineStatusManager = new OnlineStatusManager(socketManager);
