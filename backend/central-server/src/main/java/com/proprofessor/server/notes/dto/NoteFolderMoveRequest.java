package com.proprofessor.server.notes.dto;

/** Null {@code parentId} moves the folder to the root level. */
public record NoteFolderMoveRequest(Long parentId) {
}
