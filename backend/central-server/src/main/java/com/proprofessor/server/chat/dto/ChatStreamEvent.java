package com.proprofessor.server.chat.dto;

import com.proprofessor.server.chat.ChatStreamEvents;

/**
 * Events streamed over SSE in response to {@code POST /api/v1/chats/send}.
 * Each record carries its {@code type} so the serialized JSON matches the wire
 * contract, and the frontend can dispatch by {@code type}.
 */
public sealed interface ChatStreamEvent
        permits ChatStreamEvent.ChatStart, ChatStreamEvent.ChatTitle, ChatStreamEvent.ChatTranscript,
        ChatStreamEvent.ChatChunk, ChatStreamEvent.ChatSettings, ChatStreamEvent.ChatThinking,
        ChatStreamEvent.ChatMetrics, ChatStreamEvent.ChatDone, ChatStreamEvent.ChatError {

    String type();

    /** {@code chat.start} — conversation is ready (new or loaded). */
    record ChatStart(String type, long conversationId, String title) implements ChatStreamEvent {
        public static ChatStart of(long conversationId, String title) {
            return new ChatStart(ChatStreamEvents.CHAT_START, conversationId, title);
        }
    }

    /**
     * {@code chat.title} — a derived title for a conversation that started without one (a voice turn
     * carries no typed text). Sent once the spoken words are known so the sidebar entry can fill in.
     */
    record ChatTitle(String type, long conversationId, String title) implements ChatStreamEvent {
        public static ChatTitle of(long conversationId, String title) {
            return new ChatTitle(ChatStreamEvents.CHAT_TITLE, conversationId, title);
        }
    }

    /**
     * {@code chat.transcript} — an audio turn's transcribed user words, sent once so the user's
     * bubble fills in live. The model produced this by transcribing its own audio input.
     */
    record ChatTranscript(String type, long conversationId, String content) implements ChatStreamEvent {
        public static ChatTranscript of(long conversationId, String content) {
            return new ChatTranscript(ChatStreamEvents.CHAT_TRANSCRIPT, conversationId, content);
        }
    }

    /** {@code chat.chunk} — one streamed answer token. */
    record ChatChunk(String type, long conversationId, String delta) implements ChatStreamEvent {
        public static ChatChunk of(long conversationId, String delta) {
            return new ChatChunk(ChatStreamEvents.CHAT_CHUNK, conversationId, delta);
        }
    }

    /**
     * {@code chat.settings} — the user changed inference params mid-conversation. A {@code settings}
     * message row was persisted (id in {@code messageId}); the UI inserts a centered divider before
     * the new turn. Sent once, right after {@code chat.start}.
     */
    record ChatSettings(String type, long conversationId, long messageId) implements ChatStreamEvent {
        public static ChatSettings of(long conversationId, long messageId) {
            return new ChatSettings(ChatStreamEvents.CHAT_SETTINGS, conversationId, messageId);
        }
    }

    /** {@code chat.thinking} — one streamed reasoning token (live-only, not persisted). */
    record ChatThinking(String type, long conversationId, String delta) implements ChatStreamEvent {
        public static ChatThinking of(long conversationId, String delta) {
            return new ChatThinking(ChatStreamEvents.CHAT_THINKING, conversationId, delta);
        }
    }

    /**
     * {@code chat.metrics} — token/timing data, emitted just before {@code chat.done} when the
     * request asked for verbose output. Timing fields are {@code null} for providers that don't
     * report them (e.g. Ollama supplies token counts only).
     */
    record ChatMetrics(
            String type,
            long conversationId,
            Long promptTokens,
            Long completionTokens,
            Long totalTokens,
            Double evalRate,
            Double totalDurationS
    ) implements ChatStreamEvent {
        public static ChatMetrics of(
                long conversationId, Long promptTokens, Long completionTokens, Long totalTokens,
                Double evalRate, Double totalDurationS) {
            return new ChatMetrics(ChatStreamEvents.CHAT_METRICS, conversationId,
                    promptTokens, completionTokens, totalTokens, evalRate, totalDurationS);
        }
    }

    /** {@code chat.done} — assistant message persisted. */
    record ChatDone(String type, long conversationId, long messageId) implements ChatStreamEvent {
        public static ChatDone of(long conversationId, long messageId) {
            return new ChatDone(ChatStreamEvents.CHAT_DONE, conversationId, messageId);
        }
    }

    /**
     * {@code chat.error} — something went wrong. {@code conversationId}/{@code messageId} are present
     * when the failure happened after the conversation existed and a persisted error message was saved;
     * they are {@code null} for pre-conversation failures. {@code requestId} ties the error to the
     * server logs.
     */
    record ChatError(String type, Long conversationId, Long messageId, String requestId, String message)
            implements ChatStreamEvent {

        /** Failure before a conversation/message exists — nothing persisted. */
        public static ChatError of(String requestId, String message) {
            return new ChatError(ChatStreamEvents.CHAT_ERROR, null, null, requestId, message);
        }

        /** Failure after the conversation exists, with a persisted error message. */
        public static ChatError of(long conversationId, long messageId, String requestId, String message) {
            return new ChatError(ChatStreamEvents.CHAT_ERROR, conversationId, messageId, requestId, message);
        }
    }
}
