package com.proprofessor.server.chat.dto;

import com.proprofessor.server.media.dto.MediaResponse;

import java.time.Instant;
import java.util.List;

/**
 * A single message as exposed to the frontend.
 *
 * @param id          message id
 * @param role        {@code user} / {@code assistant} / {@code system} / {@code error}
 * @param content     message text
 * @param createdAt   when it was created
 * @param attachments media attached to this message (empty when none)
 */
public record ChatMessageDto(
        Long id,
        String role,
        String content,
        Instant createdAt,
        List<MediaResponse> attachments
) {
}
