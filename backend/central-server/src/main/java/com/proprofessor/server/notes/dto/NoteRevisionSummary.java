package com.proprofessor.server.notes.dto;

import java.time.Instant;

/**
 * One entry in a note's revision history (content stays server-side; restore by id).
 *
 * @param id        revision id
 * @param createdAt when the snapshot was taken
 */
public record NoteRevisionSummary(
        Long id,
        Instant createdAt
) {
}
