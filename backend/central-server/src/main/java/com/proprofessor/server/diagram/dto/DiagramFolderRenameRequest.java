package com.proprofessor.server.diagram.dto;

/** Rename only — moving a folder is a separate endpoint, so an absent field is never ambiguous. */
public record DiagramFolderRenameRequest(String name) {
}
