package com.proprofessor.server.common.db;

import java.time.Instant;

public record ConversationRow(
        long id,
        ModelRow model,
        String title,
        String mode,
        ConversationSettings settings,
        VoiceSettings voice,
        int lastContextTokens,
        Instant createdAt,
        Instant updatedAt
) {
}
