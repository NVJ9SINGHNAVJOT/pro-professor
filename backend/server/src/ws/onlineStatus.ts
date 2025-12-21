import { ExtendedWebSocket } from "@/ws/types";
import { SocketManager, socketManager } from "@/ws/getSocketIds";
import { logger } from "@/logger/logger";

/**
 * Manages user online/offline status tracking
 */
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
      const remainingSockets = this.socketManager.getSocketIds(userId);

      if (remainingSockets.length === 0) {
        logger.info(`User ${userId} is now offline`);
      } else {
        logger.info(`User ${userId} has ${remainingSockets.length} remaining connection(s)`);
      }
    }
  }

  isUserOnline(userId: number): boolean {
    return this.socketManager.getSocketIds(userId).length > 0;
  }

  getUserOnlineStatus(userId: number): {
    isOnline: boolean;
    connectionCount: number;
  } {
    const sockets = this.socketManager.getSocketIds(userId);
    return {
      isOnline: sockets.length > 0,
      connectionCount: sockets.length,
    };
  }
}

export const onlineStatusManager = new OnlineStatusManager(socketManager);
