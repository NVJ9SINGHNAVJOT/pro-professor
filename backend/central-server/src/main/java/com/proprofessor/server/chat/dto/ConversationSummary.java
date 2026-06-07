package com.proprofessor.server.chat.dto;

import java.time.Instant;

/**
 * Lightweight conversation entry for the sidebar list (no messages).
 *
 * @param id        conversation id
 * @param title     conversation title (derived from the first message)
 * @param model     the model name it talks to
 * @param provider  the model's provider
 * @param updatedAt last activity (list is ordered by this, newest first)
 */
public record ConversationSummary(
        Long id,
        String title,
        String model,
        String provider,
        Instant updatedAt
) {
}
