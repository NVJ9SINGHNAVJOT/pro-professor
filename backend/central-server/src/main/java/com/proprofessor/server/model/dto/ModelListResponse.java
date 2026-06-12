package com.proprofessor.server.model.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/models/all}.
 */
public record ModelListResponse(
        List<ProviderModel> models
) {
}
