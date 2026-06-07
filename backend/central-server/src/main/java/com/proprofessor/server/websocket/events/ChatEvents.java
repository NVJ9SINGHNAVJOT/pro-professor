package com.proprofessor.server.websocket.events;

// INFO: Any change to these event names must be kept in sync with frontend/src/socket/events.ts

/**
 * WebSocket event-name constants. Following the project convention:
 * client→server events are what the server listens for; server→client events are
 * what the client listens for.
 */
public final class ChatEvents {

    private ChatEvents() {
    }

    // ── client → server (server listens) ──
    public static final String CHAT_SEND = "chat.send";

    // ── server → client (client listens) ──
    public static final String CHAT_START = "chat.start";
    public static final String CHAT_CHUNK = "chat.chunk";
    public static final String CHAT_DONE = "chat.done";
    public static final String CHAT_ERROR = "chat.error";
}
