package com.proprofessor.server.notes.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/notes/links} — every note's outgoing
 * links, the edge list the frontend graph view is generated from.
 *
 * @param links all stored note links
 */
public record NoteLinksResponse(
        List<NoteLinkDto> links
) {
}
