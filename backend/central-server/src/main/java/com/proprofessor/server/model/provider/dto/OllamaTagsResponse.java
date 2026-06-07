package com.proprofessor.server.model.provider.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Subset of the Ollama {@code GET /api/tags} response we actually consume.
 * Unknown JSON fields are ignored by Jackson's default configuration.
 */
public record OllamaTagsResponse(
        List<OllamaModel> models
) {

    public record OllamaModel(
            String name,
            OllamaDetails details
    ) {
    }

    public record OllamaDetails(
            String family,
            @JsonProperty("parameter_size") String parameterSize
    ) {
    }
}
