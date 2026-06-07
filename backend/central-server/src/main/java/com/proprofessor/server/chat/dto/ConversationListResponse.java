package com.proprofessor.server.chat.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/chats} — wraps the list under a
 * {@code conversations} key (same convention as the models endpoint).
 */
public record ConversationListResponse(
        List<ConversationSummary> conversations
) {
}
