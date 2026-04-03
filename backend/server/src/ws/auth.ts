import { IncomingMessage } from "http";

function getAllowedOrigins(): string[] {
  const allowedOrigins = process.env["ALLOWED_ORIGINS"] || "";

  return allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getUserIdFromRequest(req: IncomingMessage): number | null {
  const rawUserId = req.headers["user-id"];

  if (!rawUserId || Array.isArray(rawUserId)) {
    return null;
  }

  const userId = parseInt(rawUserId, 10);

  if (isNaN(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export function isWebSocketHandshakeAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const userId = getUserIdFromRequest(req);

  if (!origin || allowedOrigins.length === 0) {
    return false;
  }

  if (!allowedOrigins.includes(origin)) {
    return false;
  }

  return userId !== null;
}

/**
 * Placeholder verifier for WebSocket connections.
 * Replace this with real auth verification later.
 */
export async function verifyWebSocketConnection(req: IncomingMessage): Promise<boolean> {
  return isWebSocketHandshakeAllowed(req);
}

/**
 * Authenticates WebSocket connection and extracts userId.
 * TODO: Implement JWT token verification after real auth verification is added.
 */
export async function authenticateConnection(req: IncomingMessage): Promise<number | null> {
  return getUserIdFromRequest(req);
}
