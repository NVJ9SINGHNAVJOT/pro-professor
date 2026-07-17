package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * In-memory shape of a {@code notes} row. Tags live in {@code note_tags} and are
 * fetched separately by the repository.
 *
 * @param frontmatterJson the raw jsonb text of the parsed YAML frontmatter ({@code {}} when none)
 */
public record NoteRow(
        long id,
        String title,
        String content,
        String frontmatterJson,
        Instant createdAt,
        Instant updatedAt
) {
}
