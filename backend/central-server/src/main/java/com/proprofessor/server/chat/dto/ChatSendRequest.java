package com.proprofessor.server.chat.dto;

import com.proprofessor.server.model.dto.ModelProvider;

import java.util.List;

/**
 * Request body for {@code POST /api/v1/chats/send} (the SSE streaming chat endpoint).
 *
 * @param conversationId existing conversation, or {@code null} to start a new one
 * @param provider       required when {@code conversationId} is null
 * @param model          required when {@code conversationId} is null
 * @param content        the user's message text
 * @param attachmentIds  media ids (from {@code POST /api/v1/media/upload}) to attach, or {@code null}
 * @param systemPrompt   persona/instructions for a new conversation, or {@code null}; only honored
 *                       when {@code conversationId} is null (the first turn persists it as a system row)
 * @param maxTokens          max new tokens to generate, or {@code null} for the provider default
 * @param temperature        sampling temperature, or {@code null} for the provider default
 * @param topP               nucleus sampling top-p, or {@code null} for the provider default
 * @param repetitionPenalty  repetition penalty, or {@code null} for the provider default
 * @param verbose            when {@code true}, stream token/timing metrics back to the client
 */
public record ChatSendRequest(
        Long conversationId,
        ModelProvider provider,
        String model,
        String content,
        List<Long> attachmentIds,
        String systemPrompt,
        Integer maxTokens,
        Double temperature,
        Double topP,
        Double repetitionPenalty,
        Boolean verbose
) {
}
