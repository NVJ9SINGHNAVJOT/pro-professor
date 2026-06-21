package com.proprofessor.server.chat;

import com.proprofessor.server.model.dto.ModelProvider;

import java.util.List;

/**
 * Internal command describing a send request (built by the chat controller from
 * a {@code POST /api/v1/chats/send} body). Not a wire DTO.
 *
 * @param conversationId existing conversation, or {@code null} to start a new one
 * @param provider       required when {@code conversationId} is null
 * @param model          required when {@code conversationId} is null
 * @param content        the user's message text
 * @param attachmentIds  media ids to attach to the user message (never {@code null}; may be empty)
 * @param options        per-request inference settings (never {@code null}; see {@link InferenceOptions})
 */
public record ChatSendCommand(
        Long conversationId,
        ModelProvider provider,
        String model,
        String content,
        List<Long> attachmentIds,
        InferenceOptions options
) {
}
