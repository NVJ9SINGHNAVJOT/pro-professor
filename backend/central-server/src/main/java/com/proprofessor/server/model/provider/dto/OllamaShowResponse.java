package com.proprofessor.server.model.provider.dto;

import java.util.List;

/**
 * Subset of the Ollama {@code POST /api/show} response we consume.
 * Only the {@code capabilities} field is needed; unknown JSON fields
 * are ignored by Jackson's default configuration.
 */
public record OllamaShowResponse(
        List<String> capabilities
) {
}
