package com.proprofessor.server.common.db;

import java.time.Instant;

public record ConversationRow(
        long id,
        ModelRow model,
        String title,
        String mode,
        ConversationSettings settings,
        Instant createdAt,
        Instant updatedAt
) {
}
