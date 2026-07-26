package com.proprofessor.server.diagram.dto;

/** A folder row in the sidebar tree. {@code parentId} is null at the root level. */
public record DiagramFolderSummary(long id, String name, Long parentId) {
}
