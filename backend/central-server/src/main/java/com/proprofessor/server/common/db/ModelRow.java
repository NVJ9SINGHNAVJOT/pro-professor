package com.proprofessor.server.common.db;

import java.time.Instant;

public record ModelRow(
        long id,
        String name,
        String provider,
        String role,
        String version,
        boolean isActive,
        Instant createdAt,
        Instant updatedAt
) {
}
