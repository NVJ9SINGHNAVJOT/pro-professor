package com.proprofessor.server.common.db;

import java.time.Instant;

/**
 * In-memory shape of a {@code note_revisions} row — a content snapshot taken
 * before an AI update (or restore) overwrote the note.
 */
public record NoteRevisionRow(
        long id,
        long noteId,
        String content,
        Instant createdAt
) {
}
