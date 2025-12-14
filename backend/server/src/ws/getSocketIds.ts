/* eslint-disable drizzle/enforce-delete-with-where */
import { ExtendedWebSocket } from "./types";
import { WebSocket } from "ws";

export { ExtendedWebSocket };

/**
 * Manages user-to-socket mappings and connection tracking
 */
export class SocketManager {
  private userSocketMap = new Map<number, Set<ExtendedWebSocket>>();
  private socketUserMap = new Map<ExtendedWebSocket, number>();

  addSocketForUser(userId: number, ws: ExtendedWebSocket): void {
    if (!this.userSocketMap.has(userId)) {
      this.userSocketMap.set(userId, new Set());
    }
    this.userSocketMap.get(userId)!.add(ws);
    this.socketUserMap.set(ws, userId);
  }

  removeSocketForUser(ws: ExtendedWebSocket): void {
    const userId = this.socketUserMap.get(ws);
    if (userId !== undefined) {
      const sockets = this.userSocketMap.get(userId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          this.userSocketMap.delete(userId);
        }
      }
      this.socketUserMap.delete(ws);
    }
  }

  /**
   * Returns all open socket connections for a user, automatically cleaning up closed connections
   */
  getSocketIds(userId: number): ExtendedWebSocket[] {
    const sockets = this.userSocketMap.get(userId);
    if (!sockets) {
      return [];
    }

    const openSockets: ExtendedWebSocket[] = [];
    const closedSockets: ExtendedWebSocket[] = [];

    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        openSockets.push(ws);
      } else {
        closedSockets.push(ws);
      }
    });

    if (closedSockets.length > 0) {
      closedSockets.forEach((ws) => {
        sockets.delete(ws);
        this.socketUserMap.delete(ws);
      });

      if (sockets.size === 0) {
        this.userSocketMap.delete(userId);
      }
    }

    return openSockets;
  }

  getUserIdForSocket(ws: ExtendedWebSocket): number | undefined {
    return this.socketUserMap.get(ws);
  }

  getAllConnectedUserIds(): number[] {
    const connectedUserIds: number[] = [];

    this.userSocketMap.forEach((sockets, userId) => {
      const hasOpenConnection = Array.from(sockets).some((ws) => ws.readyState === WebSocket.OPEN);

      if (hasOpenConnection) {
        connectedUserIds.push(userId);
      }
    });

    return connectedUserIds;
  }

  getTotalActiveConnections(): number {
    let count = 0;
    this.userSocketMap.forEach((sockets) => {
      count += Array.from(sockets).filter((ws) => ws.readyState === WebSocket.OPEN).length;
    });
    return count;
  }

  clearAllMappings(): void {
    this.userSocketMap.clear();
    this.socketUserMap.clear();
  }
}

export const socketManager = new SocketManager();
