package com.proprofessor.server.notes.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/notes}.
 *
 * <p>Folders ride along with the notes rather than having a list endpoint of their own: the
 * explorer can't draw either half without the other, and one request keeps them consistent.
 *
 * @param folders every folder, flat — the client assembles the tree from {@code parentId}
 * @param notes   all notes, newest-edited first
 */
public record NoteExplorerResponse(
        List<NoteFolderSummary> folders,
        List<NoteSummary> notes
) {
}
