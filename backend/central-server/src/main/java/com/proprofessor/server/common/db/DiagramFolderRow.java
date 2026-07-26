package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * In-memory shape of a {@code diagram_folders} row.
 *
 * @param parentId enclosing folder, or null at the root level
 */
public record DiagramFolderRow(
        long id,
        String name,
        Long parentId,
        Instant createdAt
) {
}
