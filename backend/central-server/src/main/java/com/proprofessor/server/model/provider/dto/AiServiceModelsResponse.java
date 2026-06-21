package com.proprofessor.server.model.provider.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Subset of the AI service {@code GET /api/v1/models} response we consume.
 * Unknown JSON fields are ignored by Jackson's default configuration.
 */
public record AiServiceModelsResponse(
        List<AiServiceModel> data
) {

    public record AiServiceModel(
            String name,
            boolean loadable,
            @JsonProperty("input_modalities") List<String> inputModalities,
            @JsonProperty("max_context_tokens") Integer maxContextTokens
    ) {
    }
}
