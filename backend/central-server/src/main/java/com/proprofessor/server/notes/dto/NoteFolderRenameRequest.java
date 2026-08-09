package com.proprofessor.server.notes.dto;

/** Rename only — moving a folder is a separate endpoint, so an absent field is never ambiguous. */
public record NoteFolderRenameRequest(String name) {
}
