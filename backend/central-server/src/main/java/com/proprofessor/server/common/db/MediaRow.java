package com.proprofessor.server.common.db;

import java.time.Instant;

public record MediaRow(
        long id,
        String storageId,
        String originalFilename,
        String mimeType,
        long size,
        String category,
        Instant createdAt,
        Instant updatedAt
) {
}
