import { IncomingMessage, Server as HTTPServer } from "http";
import { WebSocketServer } from "ws";
import { logger } from "@/logger/logger";
import { authenticateConnection, isWebSocketHandshakeAllowed } from "@/ws/auth";
import { defaultWebSocketConfig } from "@/ws/config";
import { socketEmitter, setWebSocketServer } from "@/ws/emitter/emitter";
import { CLIENT_EVENTS, SERVER_EVENTS, ServerEvent } from "@/ws/events";
import { handleTestNotificationEvent } from "@/ws/handlers/notification/notification.handler";
import { onlineStatusManager } from "@/ws/managers/onlineStatusManager";
import { socketManager } from "@/ws/managers/socketManager";
import { ExtendedWebSocket, WebSocketMessage } from "@/ws/types";
import { validateMessage } from "@/ws/validators";

// eslint-disable-next-line no-unused-vars
const serverEventHandlers: Record<ServerEvent, (ws: ExtendedWebSocket, data: unknown) => void> = {
  [SERVER_EVENTS.TEST_NOTIFICATION]: handleTestNotificationEvent,
};

function checkRateLimit(ws: ExtendedWebSocket): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  if (!ws.lastMessageTime || ws.lastMessageTime < oneMinuteAgo) {
    ws.messageCount = 0;
    ws.lastMessageTime = now;
  }

  ws.messageCount = (ws.messageCount || 0) + 1;

  if (ws.messageCount > defaultWebSocketConfig.maxMessagesPerMinute) {
    logger.warn("Rate limit exceeded", {
      userId: ws.userId,
      messageCount: ws.messageCount,
    });
    return false;
  }

  ws.lastMessageTime = now;
  return true;
}

function checkConnectionLimit(userId: number): boolean {
  const connections = socketManager.getSocketsForUser(userId);
  return connections.length < defaultWebSocketConfig.maxConnectionsPerUser;
}

export function createWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: defaultWebSocketConfig.path,
    maxPayload: defaultWebSocketConfig.maxMessageSize,
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      return isWebSocketHandshakeAllowed(info.req);
    },
  });

  setWebSocketServer(wss);

  wss.on("connection", async (ws: ExtendedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.connectedAt = Date.now();
    ws.messageCount = 0;

    logger.info("New WebSocket connection established", {
      ip: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    const userId = await authenticateConnection(req);
    if (!userId) {
      logger.warn("WebSocket connection missing authenticated user", {
        ip: req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      });
      ws.close(1008, "Unauthorized");
      return;
    }

    if (!checkConnectionLimit(userId)) {
      logger.warn("Connection limit exceeded for user", { userId });
      ws.close(1008, "Connection limit exceeded");
      return;
    }

    ws.userId = userId;
    onlineStatusManager.setUserOnline(userId, ws);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data: Buffer) => {
      if (data.length > defaultWebSocketConfig.maxMessageSize) {
        logger.warn("Message too large", {
          size: data.length,
          maxSize: defaultWebSocketConfig.maxMessageSize,
        });
        socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
          message: "Message size exceeds limit",
        });
        return;
      }

      if (!checkRateLimit(ws)) {
        socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
          message: "Rate limit exceeded. Please slow down.",
        });
        ws.close(1008, "Rate limit exceeded");
        return;
      }

      try {
        const parsed: unknown = JSON.parse(data.toString()) as WebSocketMessage;

        if (!validateMessage(parsed)) {
          throw new Error("Invalid message structure");
        }

        logger.info("Received message from client", {
          userId: ws.userId,
          event: parsed.event,
        });

        const handler = serverEventHandlers[parsed.event];

        if (!handler) {
          logger.warn("Unknown event type received", {
            event: parsed.event,
            userId: ws.userId,
          });
          socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
            message: `Unknown event type: ${parsed.event}`,
          });
          return;
        }

        handler(ws, parsed.data);
      } catch (error) {
        logger.error("Error parsing WebSocket message", {
          error: error instanceof Error ? error.message : error,
          userId: ws.userId,
        });
        socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
          message: "Invalid message format",
        });
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      const duration = ws.connectedAt ? Date.now() - ws.connectedAt : undefined;
      logger.info("WebSocket connection closed", {
        code,
        reason: reason.toString(),
        userId: ws.userId,
        duration,
      });

      onlineStatusManager.setUserOffline(ws);
    });

    ws.on("error", (error: Error) => {
      logger.error("WebSocket error", {
        error: error.message,
        userId: ws.userId,
      });
      onlineStatusManager.setUserOffline(ws);
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const socket = client as ExtendedWebSocket;

      if (socket.isAlive === false) {
        logger.warn("Terminating inactive WebSocket connection", {
          userId: socket.userId,
        });
        onlineStatusManager.setUserOffline(socket);
        socket.terminate();
        return;
      }

      socket.isAlive = false;
      socket.ping();
    });
  }, defaultWebSocketConfig.pingInterval);

  wss.on("close", () => {
    clearInterval(interval);
    logger.info("WebSocket server closed");
  });

  logger.info("WebSocket server initialized");
  return wss;
}
