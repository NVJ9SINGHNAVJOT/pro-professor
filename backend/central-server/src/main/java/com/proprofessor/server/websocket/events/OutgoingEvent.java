package com.proprofessor.server.websocket.events;

/**
 * Events the server sends to the client. Each record carries its {@code type}
 * (set by the static factory) so the serialized JSON matches the wire contract,
 * and the frontend can dispatch by {@code type}.
 */
public sealed interface OutgoingEvent
        permits OutgoingEvent.ChatStart, OutgoingEvent.ChatChunk,
        OutgoingEvent.ChatDone, OutgoingEvent.ChatError {

    String type();

    /** {@code chat.start} — conversation is ready (new or loaded). */
    record ChatStart(String type, long conversationId, String title) implements OutgoingEvent {
        public static ChatStart of(long conversationId, String title) {
            return new ChatStart(ChatEvents.CHAT_START, conversationId, title);
        }
    }

    /** {@code chat.chunk} — one streamed token. */
    record ChatChunk(String type, long conversationId, String delta) implements OutgoingEvent {
        public static ChatChunk of(long conversationId, String delta) {
            return new ChatChunk(ChatEvents.CHAT_CHUNK, conversationId, delta);
        }
    }

    /** {@code chat.done} — assistant message persisted. */
    record ChatDone(String type, long conversationId, long messageId) implements OutgoingEvent {
        public static ChatDone of(long conversationId, long messageId) {
            return new ChatDone(ChatEvents.CHAT_DONE, conversationId, messageId);
        }
    }

    /** {@code chat.error} — something went wrong. */
    record ChatError(String type, String message) implements OutgoingEvent {
        public static ChatError of(String message) {
            return new ChatError(ChatEvents.CHAT_ERROR, message);
        }
    }
}
