package com.proprofessor.server.notes.dto;

/**
 * Request body for {@code POST /api/v1/notes}.
 *
 * @param title    desired title, or {@code null}/blank to derive one (frontmatter {@code title},
 *                 else the first {@code #} heading, else "Untitled")
 * @param content  full Markdown source, optionally starting with a YAML frontmatter block
 * @param folderId where to file it, or null for the root level — set when the note was started
 *                 from a folder's own menu
 */
public record NoteCreateRequest(
        String title,
        String content,
        Long folderId
) {
}
