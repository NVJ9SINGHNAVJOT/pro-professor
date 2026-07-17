package com.proprofessor.server.notes.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/notes}.
 *
 * @param notes all notes, newest-edited first
 */
public record NoteListResponse(
        List<NoteSummary> notes
) {
}
