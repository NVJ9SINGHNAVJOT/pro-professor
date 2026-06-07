import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { WS_URL_SERVER } from "@/services/apis";
import { serverE } from "@/socket/events";
import type { ChatSendPayload, ServerEvent, ServerEventMap, ServerEventType } from "@/types/socket/chatEvents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void;

interface SocketContextValue {
  connect: () => void;
  disconnect: () => void;
  sendChat: (payload: ChatSendPayload) => void;
  subscribe: <T extends ServerEventType>(type: T, handler: (payload: ServerEventMap[T]) => void) => () => void;
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
  // type -> set of handlers
  const subscribersRef = useRef<Map<string, Set<Handler>>>(new Map());
  // messages queued while the socket is still connecting
  const pendingRef = useRef<string[]>([]);

  const dispatch = useCallback((event: ServerEvent) => {
    const handlers = subscribersRef.current.get(event.type);
    handlers?.forEach((handler) => handler(event));
  }, []);

  const connect = useCallback(() => {
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket(WS_URL_SERVER);
    socketRef.current = ws;

    ws.onopen = () => {
      pendingRef.current.forEach((msg) => ws.send(msg));
      pendingRef.current = [];
    };

    ws.onmessage = (event) => {
      try {
        dispatch(JSON.parse(event.data) as ServerEvent);
      } catch {
        // ignore non-JSON frames
      }
    };

    ws.onclose = () => {
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [dispatch]);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const sendChat = useCallback(
    (payload: ChatSendPayload) => {
      const message = JSON.stringify({ type: serverE.CHAT_SEND, ...payload });
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      } else {
        // not open yet — queue it and make sure we're connecting
        pendingRef.current.push(message);
        connect();
      }
    },
    [connect]
  );

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

  // Stable value: streamed tokens never touch React state here, so consumers don't re-render.
  const value = useMemo<SocketContextValue>(
    () => ({ connect, disconnect, sendChat, subscribe }),
    [connect, disconnect, sendChat, subscribe]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
