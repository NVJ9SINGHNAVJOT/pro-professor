package com.proprofessor.server.notes.dto;

/**
 * One folder in the note explorer's tree, sent flat — the client assembles the levels.
 *
 * @param parentId enclosing folder, or null at the root level
 */
public record NoteFolderSummary(
        Long id,
        String name,
        Long parentId
) {
}
