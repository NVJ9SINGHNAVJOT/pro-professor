import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "@/components/common/toast";
import { WS_URL_SERVER } from "@/services/client/config";
import { wsEvents } from "@/socket/events";
import type { ServerEvent, ServerEventMap, ServerEventType } from "@/types/socket/chatEvents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;

interface SocketContextValue {
  connect: () => void;
  disconnect: () => void;
  subscribe: <T extends ServerEventType>(type: T, handler: (payload: ServerEventMap[T]) => void) => () => void;
  /** Read .current for the live WebSocket readyState (WebSocket.CLOSED when no socket). */
  readyStateRef: RefObject<number>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useSocketContext = (): SocketContextValue => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return ctx;
};

export default function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<WebSocket | null>(null);
  // type → set of handlers
  const subscribersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const readyStateRef = useRef<number>(WebSocket.CLOSED);
  // reconnect machinery
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalCloseRef = useRef(false);
  // lets ws.onclose schedule a reconnect without a circular useCallback dependency
  const connectRef = useRef<() => void>(() => {});

  const dispatch = useCallback((event: ServerEvent) => {
    // Built-in notification handling: show toast for notification.info
    if (event.type === wsEvents.NOTIFICATION_INFO) {
      toast.info(event.name, { description: event.description });
    }

    // Also forward to any custom subscribers
    const handlers = subscribersRef.current.get(event.type);
    handlers?.forEach((handler) => handler(event));
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    intentionalCloseRef.current = false;
    const ws = new WebSocket(WS_URL_SERVER);
    socketRef.current = ws;
    readyStateRef.current = ws.readyState;

    ws.onopen = () => {
      readyStateRef.current = ws.readyState;
      reconnectAttemptsRef.current = 0;
      // keep the connection alive through proxies / load balancers
      stopHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        dispatch(JSON.parse(event.data) as ServerEvent);
      } catch {
        // ignore non-JSON frames
      }
    };

    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      socketRef.current = null;
      readyStateRef.current = WebSocket.CLOSED;
      stopHeartbeat();
      if (intentionalCloseRef.current) return;
      // exponential backoff: 1s → 2s → 4s → ... capped at 30s
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current, RECONNECT_MAX_DELAY_MS);
      reconnectAttemptsRef.current += 1;
      console.info(`[socket] connection lost — reconnecting in ${delay / 1000}s`);
      reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
    };
  }, [dispatch, stopHeartbeat]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopHeartbeat();
    socketRef.current?.close();
    socketRef.current = null;
    readyStateRef.current = WebSocket.CLOSED;
  }, [stopHeartbeat]);

  // establish the single app-wide connection on mount; tear down on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const subscribe = useCallback(
    <T extends ServerEventType>(type: T, handler: (payload: ServerEventMap[T]) => void): (() => void) => {
      const handlers = subscribersRef.current.get(type) ?? new Set<Handler>();
      handlers.add(handler as Handler);
      subscribersRef.current.set(type, handlers);
      return () => {
        handlers.delete(handler as Handler);
      };
    },
    []
  );

  // Stable value: no React state here, so consumers don't re-render.
  const value = useMemo<SocketContextValue>(
    () => ({ connect, disconnect, subscribe, readyStateRef }),
    [connect, disconnect, subscribe]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
