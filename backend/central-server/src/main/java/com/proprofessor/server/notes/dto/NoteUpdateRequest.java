package com.proprofessor.server.notes.dto;

/**
 * Request body for {@code PUT /api/v1/notes/{id}}.
 *
 * @param title   desired title, or {@code null}/blank to derive one from the content
 * @param content full Markdown source, optionally starting with a YAML frontmatter block
 */
public record NoteUpdateRequest(
        String title,
        String content
) {
}
