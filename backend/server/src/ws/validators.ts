import { SERVER_EVENTS } from "@/ws/events";
import { WebSocketMessage } from "@/ws/types";

export function validateMessage(parsed: unknown): parsed is WebSocketMessage {
  if (typeof parsed !== "object" || parsed === null) {
    return false;
  }

  const event = "event" in parsed ? parsed.event : undefined;
  const data = "data" in parsed ? parsed.data : undefined;

  if (typeof event !== "string" || !(Object.values(SERVER_EVENTS) as string[]).includes(event)) {
    return false;
  }

  return data !== undefined;
}
