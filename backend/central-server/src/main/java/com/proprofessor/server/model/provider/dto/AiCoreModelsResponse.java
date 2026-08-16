package com.proprofessor.server.model.provider.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Subset of the AI core {@code GET /api/v1/models} response we consume.
 * Unknown JSON fields are ignored by Jackson's default configuration.
 */
public record AiCoreModelsResponse(
        List<AiCoreModel> data
) {

    public record AiCoreModel(
            String name,
            boolean loadable,
            @JsonProperty("input_modalities") List<String> inputModalities,
            @JsonProperty("max_context_tokens") Integer maxContextTokens
    ) {
    }
}
