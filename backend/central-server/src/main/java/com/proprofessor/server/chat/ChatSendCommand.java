package com.proprofessor.server.chat;

import com.proprofessor.server.model.dto.ModelProvider;

/**
 * Internal command describing a send request (built by the WebSocket handler from
 * an incoming {@code chat.send} event). Not a wire DTO.
 *
 * @param conversationId existing conversation, or {@code null} to start a new one
 * @param provider       required when {@code conversationId} is null
 * @param model          required when {@code conversationId} is null
 * @param content        the user's message text
 */
public record ChatSendCommand(
        Long conversationId,
        ModelProvider provider,
        String model,
        String content
) {
}
