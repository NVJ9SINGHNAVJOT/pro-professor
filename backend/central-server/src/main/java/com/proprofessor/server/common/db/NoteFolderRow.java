package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * In-memory shape of a {@code note_folders} row.
 *
 * @param parentId enclosing folder, or null at the root level
 */
public record NoteFolderRow(
        long id,
        String name,
        Long parentId,
        Instant createdAt
) {
}
