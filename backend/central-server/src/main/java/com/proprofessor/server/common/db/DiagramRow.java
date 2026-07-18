package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * In-memory shape of a {@code diagrams} row.
 *
 * @param contentJson the raw jsonb text of the DiagramBundle document
 */
public record DiagramRow(
        long id,
        String title,
        String contentJson,
        Instant createdAt,
        Instant updatedAt
) {
}
