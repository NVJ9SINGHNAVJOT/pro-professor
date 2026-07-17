package com.proprofessor.server.notes.dto;

/**
 * Request body for {@code POST /api/v1/notes}.
 *
 * @param title   desired title, or {@code null}/blank to derive one (frontmatter {@code title},
 *                else the first {@code #} heading, else "Untitled")
 * @param content full Markdown source, optionally starting with a YAML frontmatter block
 */
public record NoteCreateRequest(
        String title,
        String content
) {
}
