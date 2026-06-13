package com.proprofessor.server.websocket.events;

/**
 * WebSocket event-name constants. Only {@code ping} (client heartbeat) and
 * {@code notification.info} (server-pushed notifications) travel over the
 * WebSocket; chat streaming uses its own SSE channel.
 */
public final class WsEvents {

    private WsEvents() {
    }

    // ── client → server ──
    public static final String PING = "ping";

    // ── server → client ──
    public static final String NOTIFICATION_INFO = "notification.info";
}
