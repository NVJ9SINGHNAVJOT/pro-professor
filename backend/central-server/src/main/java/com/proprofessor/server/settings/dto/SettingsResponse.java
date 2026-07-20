package com.proprofessor.server.settings.dto;

import com.proprofessor.server.common.db.InferenceDefaults;

/**
 * The global default inference params. Serialized as {@code { notes: {...} }}.
 */
public record SettingsResponse(
        InferenceDefaults notes
) {
}
