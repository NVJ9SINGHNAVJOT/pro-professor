package com.proprofessor.server.notes.dto;

/** Null {@code folderId} moves the note to the root level. */
public record NoteMoveRequest(Long folderId) {
}
