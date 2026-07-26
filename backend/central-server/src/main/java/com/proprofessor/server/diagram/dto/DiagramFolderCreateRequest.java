package com.proprofessor.server.diagram.dto;

/** {@code name} is optional — blank lands as "New folder". Null {@code parentId} = root. */
public record DiagramFolderCreateRequest(String name, Long parentId) {
}
