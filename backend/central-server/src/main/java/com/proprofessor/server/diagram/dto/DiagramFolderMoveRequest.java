package com.proprofessor.server.diagram.dto;

/** Re-parents a folder. Null {@code parentId} moves it to the root level. */
public record DiagramFolderMoveRequest(Long parentId) {
}
