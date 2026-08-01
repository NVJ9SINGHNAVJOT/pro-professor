package com.proprofessor.server.notes.dto;

/** Rename only — the content is never touched, so an absent field is never ambiguous. */
public record NoteRenameRequest(String title) {
}
