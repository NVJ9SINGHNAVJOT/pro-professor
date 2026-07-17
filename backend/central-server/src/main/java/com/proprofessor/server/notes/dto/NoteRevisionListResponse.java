package com.proprofessor.server.notes.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/notes/{id}/revisions}.
 *
 * @param revisions the note's snapshots, newest first
 */
public record NoteRevisionListResponse(
        List<NoteRevisionSummary> revisions
) {
}
