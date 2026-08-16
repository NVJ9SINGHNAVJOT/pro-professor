package com.proprofessor.server.settings.dto;

import com.proprofessor.server.common.db.InferenceDefaults;
import com.proprofessor.server.common.db.VoiceSettings;

/**
 * The global defaults. Serialized as {@code { notes: {...}, chat: {...} }} — the Notes AI inference
 * params, and the voice settings a new conversation starts from.
 */
public record SettingsResponse(
        InferenceDefaults notes,
        VoiceSettings chat
) {
}
