package com.proprofessor.server.chat.dto;

import java.time.Instant;

/**
 * A single message as exposed to the frontend.
 *
 * @param id        message id
 * @param role      {@code user} / {@code assistant} / {@code system}
 * @param content   message text
 * @param createdAt when it was created
 */
public record ChatMessageDto(
        Long id,
        String role,
        String content,
        Instant createdAt
) {
}
