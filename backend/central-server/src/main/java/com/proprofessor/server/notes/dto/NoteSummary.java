package com.proprofessor.server.notes.dto;

import java.time.Instant;

import java.util.List;

/**
 * Lightweight note entry for the explorer list (no content).
 *
 * @param id        note id
 * @param title     note title
 * @param tags      the note's tags (frontmatter + inline), sorted
 * @param folderId  enclosing folder, or null at the root level
 * @param updatedAt last edit (list is ordered by this, newest first)
 */
public record NoteSummary(
        Long id,
        String title,
        List<String> tags,
        Long folderId,
        Instant updatedAt
) {
}
