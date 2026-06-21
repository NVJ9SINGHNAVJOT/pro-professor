package com.proprofessor.server.model.provider.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * Subset of the Ollama {@code POST /api/show} response we consume:
 * {@code capabilities} and {@code model_info} (for the context window).
 * Unknown JSON fields are ignored by Jackson's default configuration.
 */
public record OllamaShowResponse(
        List<String> capabilities,
        @JsonProperty("model_info") Map<String, Object> modelInfo
) {
}
