package com.proprofessor.server.chat;

/**
 * Event-name constants for the chat SSE stream ({@code POST /api/v1/chats/send}).
 * Each {@code data:} frame carries a JSON envelope with one of these {@code type} values.
 */
public final class ChatStreamEvents {

    private ChatStreamEvents() {
    }

    public static final String CHAT_START = "chat.start";
    public static final String CHAT_TITLE = "chat.title";
    public static final String CHAT_TRANSCRIPT = "chat.transcript";
    public static final String CHAT_CHUNK = "chat.chunk";
    public static final String CHAT_SETTINGS = "chat.settings";
    public static final String CHAT_THINKING = "chat.thinking";
    public static final String CHAT_METRICS = "chat.metrics";
    public static final String CHAT_DONE = "chat.done";
    public static final String CHAT_ERROR = "chat.error";
}
