package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * The single {@code app_settings} row (id = 1): global default inference params for the Notes and
 * Diagrams AI actions.
 */
public record AppSettingsRow(
        InferenceDefaults notes,
        InferenceDefaults diagram,
        Instant createdAt,
        Instant updatedAt
) {
}
