package com.proprofessor.server.websocket.events;

// INFO: Any change to these event names must be kept in sync with frontend/src/socket/events.ts

/**
 * Chat event-name constants. {@code ping} arrives over the WebSocket (connection
 * heartbeat); the {@code chat.*} events are the frames streamed back over SSE by
 * {@code POST /api/v1/chats/send}.
 */
public final class ChatEvents {

    private ChatEvents() {
    }

    // ── client → server, over WebSocket ──
    public static final String PING = "ping";

    // ── server → client, over the chat SSE stream ──
    public static final String CHAT_START = "chat.start";
    public static final String CHAT_CHUNK = "chat.chunk";
    public static final String CHAT_DONE = "chat.done";
    public static final String CHAT_ERROR = "chat.error";
}
