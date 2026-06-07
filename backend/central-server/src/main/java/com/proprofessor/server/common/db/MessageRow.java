package com.proprofessor.server.common.db;

import java.time.Instant;

public record MessageRow(
        long id,
        long conversationId,
        String role,
        String content,
        Instant createdAt,
        Instant updatedAt
) {
}
