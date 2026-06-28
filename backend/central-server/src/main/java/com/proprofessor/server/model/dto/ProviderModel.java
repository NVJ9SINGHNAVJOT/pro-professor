package com.proprofessor.server.model.dto;

import java.util.List;

/**
 * A model as exposed to the frontend, normalized across providers.
 *
 * @param name             model identifier (e.g. {@code llama3.1} or a provider model id)
 * @param provider         where the model comes from
 * @param role             always {@code "chat"} for now
 * @param version          version/parameter size if known, otherwise {@code null}
 * @param isActive         whether the model is currently usable
 * @param inputModalities  supported input types (e.g. {@code ["text"]}, {@code ["text", "image"]})
 * @param maxContextTokens model context window in tokens; always present (models without a
 *                         reported context window are logged and excluded from the model list)
 * @param supportsThinking whether the model emits reasoning/thinking the UI can display
 */
public record ProviderModel(
        String name,
        ModelProvider provider,
        String role,
        String version,
        boolean isActive,
        List<String> inputModalities,
        int maxContextTokens,
        boolean supportsThinking
) {
}
