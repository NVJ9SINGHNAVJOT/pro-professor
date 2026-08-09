package com.proprofessor.server.notes.dto;

import java.util.List;

/**
 * A plain list of notes — search hits and backlinks. The explorer's own listing carries folders
 * too and has its own shape, {@link NoteExplorerResponse}.
 *
 * @param notes the matching notes, newest-edited first
 */
public record NoteListResponse(
        List<NoteSummary> notes
) {
}
