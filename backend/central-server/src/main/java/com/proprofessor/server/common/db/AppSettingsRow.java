package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * The single {@code app_settings} row (id = 1): global default inference params for the Notes AI
 * actions, and the voice defaults every new conversation starts from.
 */
public record AppSettingsRow(
        InferenceDefaults notes,
        VoiceSettings chat,
        Instant createdAt,
        Instant updatedAt
) {
}
