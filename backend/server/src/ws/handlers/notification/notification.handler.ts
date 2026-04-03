import { logger } from "@/logger/logger";
import { socketEmitter } from "@/ws/emitter/emitter";
import { CLIENT_EVENTS } from "@/ws/events";
import { ExtendedWebSocket } from "@/ws/types";
import { validateTestNotificationEventData } from "@/ws/handlers/notification/notification.validator";

export function handleTestNotificationEvent(ws: ExtendedWebSocket, data: unknown): void {
  try {
    if (!ws.userId) {
      throw new Error("User is not authenticated");
    }

    if (!validateTestNotificationEventData(data)) {
      throw new Error("Notification message is required");
    }

    logger.info("Sending test notification to user", {
      userId: ws.userId,
      hasMessage: true,
    });

    socketEmitter.emitToUser(ws.userId, CLIENT_EVENTS.NOTIFICATION, {
      title: "Test Notification",
      message: data.message,
    });
  } catch (error) {
    logger.error("Error handling test notification event", {
      error: error instanceof Error ? error.message : error,
      userId: ws.userId,
    });
    socketEmitter.emitSocketEvent(ws, CLIENT_EVENTS.ERROR, {
      message: "Error processing test notification",
    });
  }
}
