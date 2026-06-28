package com.proprofessor.server.chat.dto;

import java.time.Instant;
import java.util.List;

/**
 * Full conversation with its messages, for opening a chat thread.
 *
 * @param id        conversation id
 * @param title     conversation title
 * @param model     model name
 * @param provider  model provider
 * @param mode      conversation mode ({@code simple})
 * @param messages  messages oldest-first
 * @param maxTokens          persisted max-tokens setting, or {@code null} for the provider default
 * @param temperature        persisted temperature, or {@code null} for the provider default
 * @param topP               persisted top-p, or {@code null} for the provider default
 * @param repetitionPenalty  persisted repetition penalty, or {@code null} for the provider default
 * @param verbose            persisted "show metrics" UI preference
 * @param thinkingEnabled    persisted "show reasoning" UI preference
 * @param createdAt when the conversation started
 * @param updatedAt last activity
 */
public record ConversationDetail(
        Long id,
        String title,
        String model,
        String provider,
        String mode,
        List<ChatMessageDto> messages,
        Integer maxTokens,
        Double temperature,
        Double topP,
        Double repetitionPenalty,
        boolean verbose,
        boolean thinkingEnabled,
        Instant createdAt,
        Instant updatedAt
) {
}
