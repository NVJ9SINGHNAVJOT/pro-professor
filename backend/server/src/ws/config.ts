/**
 * WebSocket Configuration
 * Centralized configuration for WebSocket server
 */
export interface WebSocketConfig {
  maxMessageSize: number;
  maxMessagesPerMinute: number;
  maxConnectionsPerUser: number;
  pingInterval: number;
  path: string;
}

export const defaultWebSocketConfig: WebSocketConfig = {
  maxMessageSize: 1024 * 1024, // 1MB
  maxMessagesPerMinute: 60,
  maxConnectionsPerUser: 5,
  pingInterval: 30000, // 30 seconds
  path: "/ws",
};
