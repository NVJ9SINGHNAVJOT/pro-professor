package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * In-memory shape of a {@code diagrams} row.
 *
 * @param contentJson the raw jsonb text of the Excalidraw scene document
 * @param folderId    owning folder, or null at the root level
 */
public record DiagramRow(
        long id,
        String title,
        String contentJson,
        Long folderId,
        Instant createdAt,
        Instant updatedAt
) {
}
