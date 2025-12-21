import { ExtendedWebSocket } from "@/ws/types";
import { CLIENT_EVENTS } from "@/ws/events";
import { socketEmitter } from "@/ws/emitSocketEvent";
import { logger } from "@/logger/logger";
import { MessageEventData } from "@/ws/types";

/**
 * Handles message events from clients and emits "receivedmessage" event back
 */
export function handleMessageEvent(ws: ExtendedWebSocket, data: unknown): void {
  try {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid message data");
    }

    logger.info("Received message event from client", {
      userId: ws.userId,
      hasData: !!data,
    });

    const processedMessage: MessageEventData = {
      ...(data as Record<string, unknown>),
      timestamp: new Date().toISOString(),
    };

    socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.RECEIVED_MESSAGE, processedMessage);
  } catch (error) {
    logger.error("Error handling message event", {
      error: error instanceof Error ? error.message : error,
      userId: ws.userId,
    });
    socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
      message: "Error processing message",
    });
  }
}
