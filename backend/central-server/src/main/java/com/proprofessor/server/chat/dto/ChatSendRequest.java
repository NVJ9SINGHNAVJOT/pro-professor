package com.proprofessor.server.chat.dto;

import com.proprofessor.server.model.dto.ModelProvider;

/**
 * Request body for {@code POST /api/v1/chats/send} (the SSE streaming chat endpoint).
 *
 * @param conversationId existing conversation, or {@code null} to start a new one
 * @param provider       required when {@code conversationId} is null
 * @param model          required when {@code conversationId} is null
 * @param content        the user's message text
 */
public record ChatSendRequest(
        Long conversationId,
        ModelProvider provider,
        String model,
        String content
) {
}
