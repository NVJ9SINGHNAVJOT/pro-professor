package com.proprofessor.server.model.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/models/all}.
 *
 * <p>Wraps the list under a {@code models} key to match the Node response shape
 * ({@code data: { models: [...] }}).
 */
public record ModelListResponse(
        List<ProviderModel> models
) {
}
