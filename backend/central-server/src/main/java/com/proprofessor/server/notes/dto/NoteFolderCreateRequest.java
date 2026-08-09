package com.proprofessor.server.notes.dto;

/** A blank name becomes "New folder"; a null {@code parentId} creates at the root level. */
public record NoteFolderCreateRequest(String name, Long parentId) {
}
