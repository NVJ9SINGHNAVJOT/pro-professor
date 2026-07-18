package com.proprofessor.server.common.db;

/**
 * One set of default inference params, stored in {@code app_settings} and applied server-side to a
 * feature's AI actions. Mirrors the sampling fields of {@code InferenceOptions} (max tokens plus the
 * three sampling params); verbose/thinking are chat-only display prefs and are not part of a default.
 */
public record InferenceDefaults(
        Integer maxTokens,
        Double temperature,
        Double topP,
        Double repetitionPenalty
) {
}
