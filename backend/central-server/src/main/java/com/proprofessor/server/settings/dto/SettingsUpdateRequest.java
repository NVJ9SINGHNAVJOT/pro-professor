package com.proprofessor.server.settings.dto;

import com.proprofessor.server.common.db.InferenceDefaults;
import com.proprofessor.server.common.db.VoiceSettings;

/**
 * Request body for {@code PUT /api/v1/settings} — the new default inference params and the new
 * default voice settings.
 */
public record SettingsUpdateRequest(
        InferenceDefaults notes,
        VoiceSettings chat
) {
}
