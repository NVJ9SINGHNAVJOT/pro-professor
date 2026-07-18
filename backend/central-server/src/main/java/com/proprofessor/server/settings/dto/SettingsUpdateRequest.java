package com.proprofessor.server.settings.dto;

import com.proprofessor.server.common.db.InferenceDefaults;

/**
 * Request body for {@code PUT /api/v1/settings} — the new default inference params for each feature.
 */
public record SettingsUpdateRequest(
        InferenceDefaults notes,
        InferenceDefaults diagram
) {
}
