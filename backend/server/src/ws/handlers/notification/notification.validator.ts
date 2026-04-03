import { TestNotificationEventData } from "@/ws/types";

export function validateTestNotificationEventData(data: unknown): data is TestNotificationEventData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const notificationData = data as TestNotificationEventData;
  return typeof notificationData.message === "string" && notificationData.message.length > 0;
}
