package com.proprofessor.server.common.db;

/**
 * A conversation's persisted inference settings. The four sampling params are nullable
 * ({@code null} = use the provider default, mirroring {@code InferenceOptions}); {@code verbose}
 * and {@code thinkingEnabled} are UI display preferences (show metrics / show reasoning).
 */
public record ConversationSettings(
        Integer maxTokens,
        Double temperature,
        Double topP,
        Double repetitionPenalty,
        boolean verbose,
        boolean thinkingEnabled
) {
}
