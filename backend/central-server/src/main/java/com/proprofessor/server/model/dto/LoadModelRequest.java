package com.proprofessor.server.model.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/v1/models/load}.
 *
 * @param name the AI-service model name to load into memory
 */
public record LoadModelRequest(
        @NotBlank String name
) {
}
