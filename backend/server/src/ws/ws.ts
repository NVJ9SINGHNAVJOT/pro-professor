import { WebSocketServer, WebSocket } from "ws";
import { Server as HTTPServer } from "http";
import { IncomingMessage } from "http";
import { logger } from "@/logger/logger";
import { setWebSocketServer, socketEmitter } from "./emitSocketEvent";
import { socketManager } from "./getSocketIds";
import { onlineStatusManager } from "./onlineStatus";
import { handleMessageEvent } from "./events/messageEvents";
import { SERVER_EVENTS, CLIENT_EVENTS } from "./events";
import { ExtendedWebSocket, WebSocketMessage } from "./types";

const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
const MAX_MESSAGES_PER_MINUTE = 60;
const MAX_CONNECTIONS_PER_USER = 5;
const PING_INTERVAL = 30000; // 30 seconds

function validateMessage(parsed: unknown): parsed is WebSocketMessage {
  if (typeof parsed !== "object" || parsed === null) {
    return false;
  }
  return true;
}

function checkRateLimit(ws: ExtendedWebSocket): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  if (!ws.lastMessageTime || ws.lastMessageTime < oneMinuteAgo) {
    ws.messageCount = 0;
    ws.lastMessageTime = now;
  }

  ws.messageCount = (ws.messageCount || 0) + 1;

  if (ws.messageCount > MAX_MESSAGES_PER_MINUTE) {
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
  const connections = socketManager.getSocketIds(userId);
  return connections.length < MAX_CONNECTIONS_PER_USER;
}

/**
 * Authenticates WebSocket connection and extracts userId
 * TODO: Implement JWT token verification
 */
function authenticateConnection(req: IncomingMessage): number | null {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const userIdParam = url.searchParams.get("userId");

  if (userIdParam) {
    const userId = parseInt(userIdParam, 10);
    if (!isNaN(userId) && userId > 0) {
      return userId;
    }
  }

  return null;
}

export function createWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: MAX_MESSAGE_SIZE,
    verifyClient: (_info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      return true;
    },
  });

  setWebSocketServer(wss);

  wss.on("connection", (ws: ExtendedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.connectedAt = Date.now();
    ws.messageCount = 0;

    logger.info("New WebSocket connection established", {
      ip: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    const userId = authenticateConnection(req);
    if (userId) {
      if (!checkConnectionLimit(userId)) {
        logger.warn("Connection limit exceeded for user", { userId });
        ws.close(1008, "Connection limit exceeded");
        return;
      }
      ws.userId = userId;
      onlineStatusManager.setUserOnline(userId, ws);
    }

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data: Buffer) => {
      if (data.length > MAX_MESSAGE_SIZE) {
        logger.warn("Message too large", {
          size: data.length,
          maxSize: MAX_MESSAGE_SIZE,
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
        const parsed: unknown = JSON.parse(data.toString());

        if (!validateMessage(parsed)) {
          throw new Error("Invalid message structure");
        }

        logger.info("Received message from client", {
          userId: ws.userId,
          event: parsed.event,
        });

        if (!ws.userId && parsed.userId && typeof parsed.userId === "number") {
          if (checkConnectionLimit(parsed.userId)) {
            ws.userId = parsed.userId;
            onlineStatusManager.setUserOnline(parsed.userId, ws);
          } else {
            socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
              message: "Connection limit exceeded",
            });
            return;
          }
        }

        if (parsed.event === SERVER_EVENTS.MESSAGE) {
          handleMessageEvent(ws, parsed.data || parsed);
        } else if (parsed.event) {
          logger.warn("Unknown event type received", {
            event: parsed.event,
            userId: ws.userId,
          });
          socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
            message: `Unknown event type: ${parsed.event}`,
          });
        } else {
          handleMessageEvent(ws, parsed);
        }
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
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) {
        logger.warn("Terminating inactive WebSocket connection", {
          userId: ws.userId,
        });
        onlineStatusManager.setUserOffline(ws);
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL);

  wss.on("close", () => {
    clearInterval(interval);
    logger.info("WebSocket server closed");
  });

  logger.info("WebSocket server initialized");
  return wss;
}
