package com.proprofessor.server.chat.dto;

import com.proprofessor.server.chat.ChatStreamEvents;

/**
 * Events streamed over SSE in response to {@code POST /api/v1/chats/send}.
 * Each record carries its {@code type} so the serialized JSON matches the wire
 * contract, and the frontend can dispatch by {@code type}.
 */
public sealed interface ChatStreamEvent
        permits ChatStreamEvent.ChatStart, ChatStreamEvent.ChatChunk,
        ChatStreamEvent.ChatDone, ChatStreamEvent.ChatError {

    String type();

    /** {@code chat.start} — conversation is ready (new or loaded). */
    record ChatStart(String type, long conversationId, String title) implements ChatStreamEvent {
        public static ChatStart of(long conversationId, String title) {
            return new ChatStart(ChatStreamEvents.CHAT_START, conversationId, title);
        }
    }

    /** {@code chat.chunk} — one streamed token. */
    record ChatChunk(String type, long conversationId, String delta) implements ChatStreamEvent {
        public static ChatChunk of(long conversationId, String delta) {
            return new ChatChunk(ChatStreamEvents.CHAT_CHUNK, conversationId, delta);
        }
    }

    /** {@code chat.done} — assistant message persisted. */
    record ChatDone(String type, long conversationId, long messageId) implements ChatStreamEvent {
        public static ChatDone of(long conversationId, long messageId) {
            return new ChatDone(ChatStreamEvents.CHAT_DONE, conversationId, messageId);
        }
    }

    /** {@code chat.error} — something went wrong. */
    record ChatError(String type, String message) implements ChatStreamEvent {
        public static ChatError of(String message) {
            return new ChatError(ChatStreamEvents.CHAT_ERROR, message);
        }
    }
}
