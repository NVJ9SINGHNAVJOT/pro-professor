package com.proprofessor.server.settings.dto;

import com.proprofessor.server.common.db.InferenceDefaults;

/**
 * The global default inference params, grouped by feature. Serialized as
 * {@code { notes: {...}, diagram: {...} }}.
 */
public record SettingsResponse(
        InferenceDefaults notes,
        InferenceDefaults diagram
) {
}
