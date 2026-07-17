package com.proprofessor.server.notes.dto;

/**
 * One outgoing note link — an edge of the note graph.
 *
 * @param sourceNoteId the linking note
 * @param targetRef    the referenced note title as written (may not resolve to a note yet)
 * @param linkType     {@code link} or {@code embed}
 */
public record NoteLinkDto(
        Long sourceNoteId,
        String targetRef,
        String linkType
) {
}
